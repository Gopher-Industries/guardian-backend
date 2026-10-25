'use strict';

/**
 * Guardian — idempotent RBAC migration.
 *
 *   node src/migrateRoleAssignments.js            # report only, changes nothing
 *   node src/migrateRoleAssignments.js --apply    # write the changes
 *
 * Three jobs, all safe to run repeatedly:
 *
 *   1. BACKFILL — write a UserRoleAssignment row marked isPrimary for every
 *      user's existing User.role. Nothing depends on this (the resolver already
 *      unions User.role with assignments), but it makes the console show one
 *      complete picture instead of "primary here, extras there".
 *
 *   2. SYNC — make sure every RolePermissionSet row has a matching Role
 *      document and vice versa. Without this a capability set can exist for a
 *      role no user is able to hold, which fails silently.
 *
 *   3. AUDIT — report inheritance cycles, missing parent roles, and role names
 *      held by users that have no capability set at all.
 *
 * Nothing is deleted. Orphans are reported, not removed.
 *
 * @author   Graeme Thomas
 * @module   guardian-access-control
 * @version  1.1.0
 */

require('dotenv').config();

const mongoose = require('mongoose');

const User = require('./models/User');
const Role = require('./models/Role');
const RolePermissionSet = require('./models/RolePermissionSet');
const UserRoleAssignment = require('./models/UserRoleAssignment');
const { expandRole, normaliseRoleName } = require('./access/roleResolver');

const APPLY = process.argv.includes('--apply');

function log(...args) {
  console.log('[rbac-migrate]', ...args);
}

async function backfillPrimaryAssignments() {
  const users = await User.find({ role: { $ne: null } }).populate('role', 'name').lean();

  let created = 0;
  let existing = 0;
  let skipped = 0;

  for (const user of users) {
    const roleName = normaliseRoleName(user.role && user.role.name);
    if (!roleName) {
      skipped += 1;
      continue;
    }

    const already = await UserRoleAssignment.findOne({ user: user._id, roleName, status: 'active' }).lean();
    if (already) {
      existing += 1;
      continue;
    }

    if (APPLY) {
      await UserRoleAssignment.create({
        user: user._id,
        roleName,
        isPrimary: true,
        status: 'active',
        validFrom: new Date(),
        validUntil: null,
        assignedBy: null,
        reason: 'Backfilled from User.role by migrateRoleAssignments.js'
      });
    }
    created += 1;
  }

  return { created, existing, skipped, total: users.length };
}

async function syncRoleCollections() {
  const matrixRows = await RolePermissionSet.find({}).lean();
  const roleDocs = await Role.find({}).lean();

  const matrixNames = new Set(matrixRows.map((row) => normaliseRoleName(row.roleName)));
  const roleNames = new Set(roleDocs.map((row) => normaliseRoleName(row.name)));

  const missingRoleDoc = [...matrixNames].filter((name) => !roleNames.has(name));
  const missingMatrixRow = [...roleNames].filter((name) => !matrixNames.has(name));

  if (APPLY) {
    for (const name of missingRoleDoc) {
      await Role.updateOne({ name }, { $setOnInsert: { name } }, { upsert: true });
    }
    for (const name of missingMatrixRow) {
      // Create an EMPTY capability set, never a guessed one. A role that was
      // previously enforced by verifyRole() name checks should not silently
      // acquire permissions here.
      await RolePermissionSet.updateOne(
        { roleName: name },
        { $setOnInsert: { roleName: name, permissions: [], inherits: [], isSystem: false, description: 'Created by migration — no permissions assigned yet' } },
        { upsert: true }
      );
    }
  }

  return { missingRoleDoc, missingMatrixRow };
}

async function auditMatrix() {
  const rows = await RolePermissionSet.find({}).lean();
  const matrix = rows.reduce((acc, row) => {
    acc[normaliseRoleName(row.roleName)] = {
      roleName: normaliseRoleName(row.roleName),
      permissions: row.permissions || [],
      inherits: (row.inherits || []).map(normaliseRoleName),
      unscoped: Boolean(row.unscoped),
      canGrant: Boolean(row.canGrant)
    };
    return acc;
  }, {});

  const problems = [];
  Object.keys(matrix).forEach((roleName) => {
    const expanded = expandRole(roleName, matrix);
    if (expanded.cycles.length) problems.push(`${roleName}: inheritance cycle via ${expanded.cycles.join(', ')}`);
    if (expanded.missing.length) problems.push(`${roleName}: inherits from unknown role(s) ${expanded.missing.join(', ')}`);
    if (!expanded.permissions.length) problems.push(`${roleName}: resolves to zero permissions`);
  });

  const unscoped = Object.values(matrix).filter((entry) => entry.unscoped).map((entry) => entry.roleName);
  const grantors = Object.values(matrix).filter((entry) => entry.canGrant).map((entry) => entry.roleName);

  return { problems, unscoped, grantors, roleCount: Object.keys(matrix).length };
}

async function run() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    console.error('MONGODB_URI is not set.');
    process.exit(1);
  }

  await mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true });
  log(APPLY ? 'connected — APPLYING changes' : 'connected — DRY RUN, nothing will be written');

  const backfill = await backfillPrimaryAssignments();
  log(`primary assignments: ${backfill.created} to create, ${backfill.existing} already present, ${backfill.skipped} user(s) with no role, ${backfill.total} scanned`);

  const sync = await syncRoleCollections();
  if (sync.missingRoleDoc.length) log(`capability sets with no Role document: ${sync.missingRoleDoc.join(', ')}`);
  if (sync.missingMatrixRow.length) log(`roles with no capability set: ${sync.missingMatrixRow.join(', ')}`);
  if (!sync.missingRoleDoc.length && !sync.missingMatrixRow.length) log('role collections are already in step');

  const audit = await auditMatrix();
  log(`matrix holds ${audit.roleCount} role(s); unscoped: ${audit.unscoped.join(', ') || 'none'}; may grant: ${audit.grantors.join(', ') || 'none'}`);
  if (audit.problems.length) {
    log('problems found:');
    audit.problems.forEach((problem) => log('  - ' + problem));
  } else {
    log('no inheritance problems found');
  }

  if (!APPLY) log('dry run complete. Re-run with --apply to write.');

  await mongoose.disconnect();
  log('done');
}

if (require.main === module) {
  run().catch((error) => {
    console.error('[rbac-migrate] failed:', error);
    process.exit(1);
  });
}

module.exports = { backfillPrimaryAssignments, syncRoleCollections, auditMatrix, run };
