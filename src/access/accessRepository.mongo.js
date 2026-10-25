'use strict';

/**
 * Guardian — mongoose repository for the access-control service.
 *
 * The service talks only to this interface, so the policy engine and the HTTP
 * layer can be tested against the in-memory repository with no database at
 * all. Same interface, same behaviour.
 *
 * @author   Graeme Thomas
 * @module   guardian-access-control
 * @version  1.1.0
 */

const mongoose = require('mongoose');

const User = require('../models/User');
const Patient = require('../models/Patient');
const Organization = require('../models/Organization');
const PatientAccessGrant = require('../models/PatientAccessGrant');
const AccessAuditLog = require('../models/AccessAuditLog');
const RolePermissionSet = require('../models/RolePermissionSet');
const UserRoleAssignment = require('../models/UserRoleAssignment');
const Role = require('../models/Role');

const { DEFAULT_ROLE_MATRIX, DEFAULT_UNSCOPED_ROLES, DEFAULT_GRANTOR_ROLES } = require('./permissions');
const { resolveRoles, normaliseRoleName, descendantsOf, wouldCreateCycle } = require('./roleResolver');

/**
 * Strict ObjectId check.
 *
 * mongoose's own isValid() accepts any 12-character string, so 'not-an-obj-i'
 * passes it and then round-trips to something else entirely. Comparing the
 * round-trip catches that. The try/catch is belt and braces: construction can
 * still throw for some inputs isValid() lets through, and a malformed id from
 * a URL must produce a clean 403, never a 500.
 */
function isValidId(value) {
  if (!value) return false;
  const asString = String(value);
  if (!mongoose.Types.ObjectId.isValid(asString)) return false;
  try {
    return String(new mongoose.Types.ObjectId(asString)) === asString.toLowerCase();
  } catch (error) {
    return false;
  }
}

function grantToPlain(doc) {
  if (!doc) return null;
  const grant = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  return {
    id: String(grant._id),
    subject: String(grant.subject),
    patient: String(grant.patient),
    permissions: grant.permissions || [],
    grantType: grant.grantType || 'explicit',
    status: grant.status || 'active',
    validFrom: grant.validFrom || null,
    validUntil: grant.validUntil || null,
    grantedBy: grant.grantedBy ? String(grant.grantedBy) : null,
    grantedByRole: grant.grantedByRole || '',
    grantedAt: grant.grantedAt || null,
    reason: grant.reason || '',
    purpose: grant.purpose || 'direct-care',
    revokedBy: grant.revokedBy ? String(grant.revokedBy) : null,
    revokedAt: grant.revokedAt || null,
    revocationReason: grant.revocationReason || '',
    organization: grant.organization ? String(grant.organization) : null
  };
}

function createMongoRepository() {
  /* ------------------------------------------------------------------ *
   * Role capability matrix
   * ------------------------------------------------------------------ */

  async function getRoleMatrix() {
    const rows = await RolePermissionSet.find({}).lean();
    if (rows.length) {
      return rows.reduce((matrix, row) => {
        matrix[row.roleName] = {
          roleName: row.roleName,
          displayName: row.displayName || '',
          permissions: row.permissions || [],
          inherits: (row.inherits || []).map(normaliseRoleName),
          unscoped: Boolean(row.unscoped),
          canGrant: Boolean(row.canGrant),
          isSystem: Boolean(row.isSystem),
          description: row.description || ''
        };
        return matrix;
      }, {});
    }

    // Not seeded yet — fall back to the compiled-in defaults so the system is
    // never accidentally wide open (or completely shut) before first seed.
    return Object.entries(DEFAULT_ROLE_MATRIX).reduce((matrix, [roleName, permissions]) => {
      matrix[roleName] = {
        roleName,
        displayName: '',
        permissions,
        inherits: [],
        unscoped: DEFAULT_UNSCOPED_ROLES.includes(roleName),
        canGrant: DEFAULT_GRANTOR_ROLES.includes(roleName),
        isSystem: true,
        description: ''
      };
      return matrix;
    }, {});
  }

  function matrixRowToPlain(row) {
    return {
      roleName: row.roleName,
      displayName: row.displayName || '',
      permissions: row.permissions || [],
      inherits: (row.inherits || []).map(normaliseRoleName),
      unscoped: Boolean(row.unscoped),
      canGrant: Boolean(row.canGrant),
      isSystem: Boolean(row.isSystem),
      description: row.description || ''
    };
  }

  async function upsertRoleMatrix(roleName, patch, actorId) {
    const key = normaliseRoleName(roleName);
    const update = { updatedBy: actorId || null };
    if (Array.isArray(patch.permissions)) update.permissions = patch.permissions;
    if (Array.isArray(patch.inherits)) update.inherits = patch.inherits.map(normaliseRoleName);
    if (patch.displayName !== undefined) update.displayName = String(patch.displayName);
    if (patch.unscoped !== undefined) update.unscoped = Boolean(patch.unscoped);
    if (patch.canGrant !== undefined) update.canGrant = Boolean(patch.canGrant);
    if (patch.description !== undefined) update.description = String(patch.description);

    const row = await RolePermissionSet.findOneAndUpdate(
      { roleName: key },
      { $set: update, $setOnInsert: { roleName: key } },
      { new: true, upsert: true }
    ).lean();

    // Keep the Role collection in step, so a capability set always corresponds
    // to a role a user can actually be given.
    await Role.updateOne({ name: key }, { $setOnInsert: { name: key } }, { upsert: true });

    return matrixRowToPlain(row);
  }

  /**
   * Create a role in BOTH collections. Without this, a RolePermissionSet row
   * can exist for a role no user is able to hold — silently useless.
   */
  async function createRole(roleName, data = {}) {
    const key = normaliseRoleName(roleName);
    const existing = await RolePermissionSet.findOne({ roleName: key }).lean();
    if (existing) return { role: matrixRowToPlain(existing), created: false };

    const row = await RolePermissionSet.create({
      roleName: key,
      displayName: data.displayName || '',
      permissions: data.permissions || [],
      inherits: (data.inherits || []).map(normaliseRoleName),
      unscoped: Boolean(data.unscoped),
      canGrant: Boolean(data.canGrant),
      isSystem: false,
      description: data.description || ''
    });

    await Role.updateOne({ name: key }, { $setOnInsert: { name: key } }, { upsert: true });
    return { role: matrixRowToPlain(row.toObject()), created: true };
  }

  async function deleteRole(roleName) {
    const key = normaliseRoleName(roleName);
    const result = await RolePermissionSet.deleteOne({ roleName: key });
    await Role.deleteOne({ name: key });
    return { deleted: result.deletedCount > 0 };
  }

  async function roleUsage(roleName) {
    const key = normaliseRoleName(roleName);
    const matrix = await getRoleMatrix();

    const roleDoc = await Role.findOne({ name: key }).lean();
    const primaryHolders = roleDoc ? await User.countDocuments({ role: roleDoc._id }) : 0;
    const assignedHolders = await UserRoleAssignment.countDocuments({ roleName: key, status: 'active' });

    return {
      roleName: key,
      primaryHolders,
      assignedHolders,
      descendants: descendantsOf(key, matrix),
      isSystem: Boolean((matrix[key] || {}).isSystem)
    };
  }

  async function checkInheritanceCycle(childRole, parentRoles) {
    const matrix = await getRoleMatrix();
    return (parentRoles || []).filter((parent) => wouldCreateCycle(childRole, parent, matrix));
  }

  /* ---------------- role assignments (multi-role) ---------------- */

  function liveAssignmentQuery(now) {
    return {
      status: 'active',
      $and: [
        { $or: [{ validFrom: null }, { validFrom: { $lte: now } }] },
        { $or: [{ validUntil: null }, { validUntil: { $gt: now } }] }
      ]
    };
  }

  async function activeRoleNames(userId) {
    if (!isValidId(userId)) return [];
    const now = new Date();

    const user = await User.findById(userId).populate('role', 'name').lean();
    const names = [];
    if (user && user.role && user.role.name) names.push(normaliseRoleName(user.role.name));

    const assignments = await UserRoleAssignment.find(
      Object.assign({ user: userId }, liveAssignmentQuery(now))
    ).lean();
    assignments.forEach((assignment) => names.push(normaliseRoleName(assignment.roleName)));

    return [...new Set(names.filter(Boolean))];
  }

  function assignmentToPlain(doc) {
    if (!doc) return null;
    const row = typeof doc.toObject === 'function' ? doc.toObject() : doc;
    return {
      id: String(row._id),
      user: String(row.user),
      roleName: row.roleName,
      isPrimary: Boolean(row.isPrimary),
      status: row.status,
      validFrom: row.validFrom || null,
      validUntil: row.validUntil || null,
      assignedBy: row.assignedBy ? String(row.assignedBy) : null,
      assignedAt: row.assignedAt || null,
      reason: row.reason || '',
      revokedBy: row.revokedBy ? String(row.revokedBy) : null,
      revokedAt: row.revokedAt || null,
      revocationReason: row.revocationReason || ''
    };
  }

  async function listRoleAssignments(filter = {}) {
    const query = {};
    if (filter.user) query.user = filter.user;
    if (filter.roleName) query.roleName = normaliseRoleName(filter.roleName);
    if (filter.status) query.status = filter.status;

    const rows = await UserRoleAssignment.find(query)
      .populate('user', 'fullname email')
      .populate('assignedBy', 'fullname')
      .sort({ created_at: -1 })
      .limit(500)
      .lean();

    return {
      total: rows.length,
      assignments: rows.map((row) => ({
        ...assignmentToPlain({ ...row, user: row.user?._id, assignedBy: row.assignedBy?._id }),
        userName: row.user?.fullname || '',
        userEmail: row.user?.email || '',
        assignedByName: row.assignedBy?.fullname || ''
      }))
    };
  }

  async function findRoleAssignment({ userId, roleName, status = 'active' }) {
    const row = await UserRoleAssignment.findOne({
      user: userId,
      roleName: normaliseRoleName(roleName),
      status
    }).lean();
    return assignmentToPlain(row);
  }

  async function findRoleAssignmentById(assignmentId) {
    if (!isValidId(assignmentId)) return null;
    const row = await UserRoleAssignment.findById(assignmentId).lean();
    return assignmentToPlain(row);
  }

  async function createRoleAssignment(data) {
    const row = await UserRoleAssignment.create({
      user: data.user,
      roleName: normaliseRoleName(data.roleName),
      isPrimary: Boolean(data.isPrimary),
      status: data.status || 'active',
      validFrom: data.validFrom || new Date(),
      validUntil: data.validUntil || null,
      assignedBy: data.assignedBy || null,
      assignedAt: new Date(),
      reason: data.reason || ''
    });
    return assignmentToPlain(row);
  }

  async function updateRoleAssignment(assignmentId, patch) {
    const row = await UserRoleAssignment.findByIdAndUpdate(assignmentId, { $set: patch }, { new: true }).lean();
    return assignmentToPlain(row);
  }

  /* ------------------------------------------------------------------ *
   * Subjects and patients
   * ------------------------------------------------------------------ */

  async function getSubject(userId) {
    if (!isValidId(userId)) return null;
    const user = await User.findById(userId).populate('role', 'name').lean();
    if (!user) return null;

    const roleName = normaliseRoleName(user.role?.name);
    const matrix = await getRoleMatrix();
    const roleNames = await activeRoleNames(userId);
    const resolved = resolveRoles(roleNames.length ? roleNames : [roleName], matrix);

    return {
      id: String(user._id),
      fullname: user.fullname,
      email: user.email,
      roleName,                        // primary, for display and legacy callers
      roleNames: resolved.roleNames,   // effective set, union semantics
      status: user.approvalStatus || 'approved',
      organization: user.organization ? String(user.organization) : null,
      capabilities: resolved.capabilities,
      unscoped: resolved.unscoped,
      canGrant: resolved.canGrant,
      roleChains: resolved.resolvedFrom
    };
  }

  async function getPatient(patientId) {
    if (!isValidId(patientId)) return null;
    const patient = await Patient.findOne({ _id: patientId, isDeleted: { $ne: true } })
      .select('_id fullname caretaker assignedNurses assignedDoctor organization')
      .lean();
    if (!patient) return null;

    return {
      id: String(patient._id),
      fullname: patient.fullname,
      caretaker: patient.caretaker ? String(patient.caretaker) : null,
      assignedNurses: (patient.assignedNurses || []).map(String),
      assignedDoctor: patient.assignedDoctor ? String(patient.assignedDoctor) : null,
      organization: patient.organization ? String(patient.organization) : null
    };
  }

  async function getRelatedPatientIds(subjectId) {
    if (!isValidId(subjectId)) return [];

    const linkedOrgIds = await Organization.find({
      $or: [{ createdBy: subjectId }, { staff: subjectId }]
    }).distinct('_id');

    const conditions = [
      { caretaker: subjectId },
      { assignedNurses: subjectId },
      { assignedDoctor: subjectId }
    ];
    if (linkedOrgIds.length) conditions.push({ organization: { $in: linkedOrgIds } });

    const patients = await Patient.find({ isDeleted: { $ne: true }, $or: conditions })
      .select('_id')
      .lean();

    return patients.map((patient) => String(patient._id));
  }

  async function getAllPatientIds() {
    const patients = await Patient.find({ isDeleted: { $ne: true } }).select('_id').lean();
    return patients.map((patient) => String(patient._id));
  }

  /* ------------------------------------------------------------------ *
   * Grants
   * ------------------------------------------------------------------ */

  /**
   * Grants for a subject, a patient, or the pair.
   *
   * Ids are validated before they reach mongoose. A malformed id from a URL
   * would otherwise raise a CastError inside find(), which surfaces as a 500 —
   * turning "that patient identifier is not real" into "the server broke". An
   * id that cannot exist matches nothing, so an empty list is the honest answer.
   */
  async function getGrants({ subjectId, patientId }) {
    if (subjectId !== undefined && subjectId !== null && !isValidId(subjectId)) return [];
    if (patientId !== undefined && patientId !== null && !isValidId(patientId)) return [];

    const filter = {};
    if (subjectId) filter.subject = subjectId;
    if (patientId) filter.patient = patientId;

    const grants = await PatientAccessGrant.find(filter).lean();
    return grants.map(grantToPlain);
  }

  async function findGrantById(grantId) {
    if (!isValidId(grantId)) return null;
    const grant = await PatientAccessGrant.findById(grantId).lean();
    return grantToPlain(grant);
  }

  async function createGrant(data) {
    const grant = await PatientAccessGrant.create(data);
    return grantToPlain(grant);
  }

  async function updateGrant(grantId, patch) {
    const grant = await PatientAccessGrant.findByIdAndUpdate(grantId, { $set: patch }, { new: true }).lean();
    return grantToPlain(grant);
  }

  async function listGrants(filter = {}, { page = 1, limit = 50 } = {}) {
    // Same reasoning as getGrants: a malformed filter id is an empty result,
    // not a server error.
    if (filter.subject && !isValidId(filter.subject)) return { total: 0, page, limit, grants: [] };
    if (filter.patient && !isValidId(filter.patient)) return { total: 0, page, limit, grants: [] };

    const query = {};
    if (filter.subject) query.subject = filter.subject;
    if (filter.patient) query.patient = filter.patient;
    if (filter.status) query.status = filter.status;
    if (filter.grantType) query.grantType = filter.grantType;

    const total = await PatientAccessGrant.countDocuments(query);
    const rows = await PatientAccessGrant.find(query)
      .populate('subject', 'fullname email')
      .populate('patient', 'fullname')
      .populate('grantedBy', 'fullname email')
      .sort({ created_at: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    return {
      total,
      page,
      limit,
      grants: rows.map((row) => ({
        ...grantToPlain({ ...row, subject: row.subject?._id, patient: row.patient?._id, grantedBy: row.grantedBy?._id }),
        subjectName: row.subject?.fullname || '',
        subjectEmail: row.subject?.email || '',
        patientName: row.patient?.fullname || '',
        grantedByName: row.grantedBy?.fullname || ''
      }))
    };
  }

  /* ------------------------------------------------------------------ *
   * Audit
   * ------------------------------------------------------------------ */

  async function writeAudit(entry) {
    try {
      const row = await AccessAuditLog.create(entry);
      return { id: String(row._id) };
    } catch (error) {
      // Auditing must never break the request path; surface it in logs only.
      console.error('[access-control] audit write failed:', error.message);
      return null;
    }
  }

  async function listAudit(filter = {}, { page = 1, limit = 100 } = {}) {
    if (filter.subject && !isValidId(filter.subject)) return { total: 0, page, limit, entries: [] };
    if (filter.patient && !isValidId(filter.patient)) return { total: 0, page, limit, entries: [] };

    const query = {};
    if (filter.subject) query.subject = filter.subject;
    if (filter.patient) query.patient = filter.patient;
    if (filter.event) query.event = filter.event;
    if (filter.allowed !== undefined && filter.allowed !== null) query.allowed = filter.allowed;

    const total = await AccessAuditLog.countDocuments(query);
    const rows = await AccessAuditLog.find(query)
      .populate('subject', 'fullname email')
      .populate('patient', 'fullname')
      .populate('actor', 'fullname email')
      .sort({ at: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    return {
      total,
      page,
      limit,
      entries: rows.map((row) => ({
        id: String(row._id),
        event: row.event,
        subject: row.subject ? String(row.subject._id) : null,
        subjectName: row.subject?.fullname || '',
        subjectRole: row.subjectRole || '',
        patient: row.patient ? String(row.patient._id) : null,
        patientName: row.patient?.fullname || '',
        actorName: row.actor?.fullname || '',
        permission: row.permission,
        allowed: row.allowed,
        reason: row.reason,
        method: row.method,
        path: row.path,
        ip: row.ip,
        detail: row.detail,
        at: row.at
      }))
    };
  }

  /* ------------------------------------------------------------------ *
   * Console lookups
   * ------------------------------------------------------------------ */

  async function listUsers({ search, role, limit = 100 } = {}) {
    const query = {};
    if (search) query.$or = [{ fullname: { $regex: search, $options: 'i' } }, { email: { $regex: search, $options: 'i' } }];
    const users = await User.find(query).populate('role', 'name').limit(limit).lean();

    const now = new Date();
    const assignments = await UserRoleAssignment.find(
      Object.assign({ user: { $in: users.map((user) => user._id) } }, liveAssignmentQuery(now))
    ).lean();

    const extraByUser = assignments.reduce((acc, assignment) => {
      const key = String(assignment.user);
      (acc[key] = acc[key] || []).push(normaliseRoleName(assignment.roleName));
      return acc;
    }, {});

    return users
      .map((user) => {
        const primary = normaliseRoleName(user.role?.name);
        return {
          id: String(user._id),
          fullname: user.fullname,
          email: user.email,
          roleName: primary,
          roleNames: [...new Set([primary, ...(extraByUser[String(user._id)] || [])].filter(Boolean))],
          status: user.approvalStatus || 'approved',
          organization: user.organization ? String(user.organization) : null
        };
      })
      .filter((user) => !role || user.roleNames.includes(normaliseRoleName(role)));
  }

  async function listPatients({ search, limit = 100 } = {}) {
    const query = { isDeleted: { $ne: true } };
    if (search) query.fullname = { $regex: search, $options: 'i' };
    const patients = await Patient.find(query).select('_id fullname dateOfBirth assignedDoctor').limit(limit).lean();
    return patients.map((patient) => ({
      id: String(patient._id),
      fullname: patient.fullname,
      dateOfBirth: patient.dateOfBirth,
      assignedDoctor: patient.assignedDoctor ? String(patient.assignedDoctor) : null
    }));
  }

  return {
    name: 'mongo',
    isValidId,
    getRoleMatrix,
    upsertRoleMatrix,
    createRole,
    deleteRole,
    roleUsage,
    checkInheritanceCycle,
    activeRoleNames,
    listRoleAssignments,
    findRoleAssignment,
    findRoleAssignmentById,
    createRoleAssignment,
    updateRoleAssignment,
    getSubject,
    getPatient,
    getRelatedPatientIds,
    getAllPatientIds,
    getGrants,
    findGrantById,
    createGrant,
    updateGrant,
    listGrants,
    writeAudit,
    listAudit,
    listUsers,
    listPatients
  };
}

module.exports = { createMongoRepository, isValidId };
