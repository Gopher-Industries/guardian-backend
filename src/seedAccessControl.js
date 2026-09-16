'use strict';

/**
 * Guardian — idempotent access-control seed.
 *
 *   node src/seedAccessControl.js
 *
 * Safe to run repeatedly and safe to run on a live database:
 *   - roles are upserted, never replaced;
 *   - the permission catalogue is upserted by code;
 *   - the role matrix is only written for roles that do not have a row yet,
 *     so hand-tuning done in the console is never clobbered.
 *
 * Pass --force-matrix to reset every role back to the shipped defaults.
 *
 * @author   Graeme Thomas
 * @module   guardian-access-control
 * @version  1.1.0
 */

require('dotenv').config();

const mongoose = require('mongoose');

const Role = require('./models/Role');
const RolePermissionSet = require('./models/RolePermissionSet');
const {
  PERMISSIONS,
  DEFAULT_ROLE_MATRIX,
  DEFAULT_UNSCOPED_ROLES,
  DEFAULT_GRANTOR_ROLES
} = require('./access/permissions');

const FORCE_MATRIX = process.argv.includes('--force-matrix');

/** Shipped inheritance. Kept shallow on purpose — depth is hard to reason about. */
const DEFAULT_INHERITS = {
  admin: [],
  doctor: [],
  nurse: [],
  caretaker: [],
  analyst: []
};

const ROLE_DESCRIPTIONS = {
  admin: 'System administrator. Unscoped: may reach any patient and administer access.',
  doctor: 'Clinician. Patient-scoped, and may authorise others for patients under their care.',
  nurse: 'Nursing staff. Patient-scoped, read plus care logging.',
  caretaker: 'Caretaker. Patient-scoped, read plus care logging.',
  analyst: 'System user with no care relationship. Reads only patients explicitly authorised to them.'
};

async function seedRoles() {
  const names = Object.keys(DEFAULT_ROLE_MATRIX);
  await Promise.all(
    names.map((name) => Role.updateOne({ name }, { $setOnInsert: { name } }, { upsert: true }))
  );
  return names;
}

async function seedMatrix() {
  const results = [];

  for (const [roleName, permissions] of Object.entries(DEFAULT_ROLE_MATRIX)) {
    const existing = await RolePermissionSet.findOne({ roleName }).lean();

    if (existing && !FORCE_MATRIX) {
      results.push({ roleName, action: 'kept', permissions: existing.permissions.length });
      continue;
    }

    await RolePermissionSet.updateOne(
      { roleName },
      {
        $set: {
          permissions,
          inherits: DEFAULT_INHERITS[roleName] || [],
          unscoped: DEFAULT_UNSCOPED_ROLES.includes(roleName),
          canGrant: DEFAULT_GRANTOR_ROLES.includes(roleName),
          isSystem: true,
          displayName: roleName.charAt(0).toUpperCase() + roleName.slice(1),
          description: ROLE_DESCRIPTIONS[roleName] || ''
        },
        $setOnInsert: { roleName }
      },
      { upsert: true }
    );

    results.push({ roleName, action: existing ? 'reset' : 'created', permissions: permissions.length });
  }

  return results;
}

async function run() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    console.error('MONGODB_URI is not set.');
    process.exit(1);
  }

  await mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true });
  console.log('[seed] connected');

  const roles = await seedRoles();
  console.log(`[seed] roles upserted: ${roles.join(', ')}`);

  const matrix = await seedMatrix();
  matrix.forEach((row) => {
    console.log(`[seed] matrix ${row.roleName.padEnd(10)} ${row.action.padEnd(8)} ${row.permissions} permission(s)`);
  });

  console.log(`[seed] permission catalogue has ${PERMISSIONS.length} codes`);
  console.log('[seed] run `node src/migrateRoleAssignments.js` to check role/matrix consistency');
  if (!FORCE_MATRIX) {
    console.log('[seed] existing matrix rows were left alone. Re-run with --force-matrix to reset them.');
  }

  await mongoose.disconnect();
  console.log('[seed] done');
}

if (require.main === module) {
  run().catch((error) => {
    console.error('[seed] failed:', error);
    process.exit(1);
  });
}

module.exports = { seedRoles, seedMatrix, run };
