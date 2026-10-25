'use strict';

/**
 * Guardian — in-memory repository.
 *
 * Implements exactly the interface accessRepository.mongo.js does. It exists so
 * the policy engine, the middleware, the controllers and the console can all be
 * exercised end to end with no MongoDB anywhere — which is what makes the proof
 * harness runnable on any machine, including CI runners with no database.
 *
 * @author   Graeme Thomas
 * @module   guardian-access-control
 * @version  1.1.0
 */

const crypto = require('crypto');

const { DEFAULT_ROLE_MATRIX, DEFAULT_UNSCOPED_ROLES, DEFAULT_GRANTOR_ROLES } = require('./permissions');
const { resolveRoles, normaliseRoleName, descendantsOf, wouldCreateCycle } = require('./roleResolver');

function newId() {
  return crypto.randomBytes(12).toString('hex');
}

function isValidId(value) {
  return typeof value === 'string' && /^[0-9a-fA-F]{24}$/.test(value);
}

function createMemoryRepository(seed = {}) {
  const store = {
    users: new Map(),
    patients: new Map(),
    grants: new Map(),
    audit: [],
    matrix: new Map(),
    assignments: new Map()
  };

  /* ---------------- seeding helpers (test-only) ---------------- */

  function addUser(user) {
    const id = user.id || newId();
    const record = {
      id,
      fullname: user.fullname || 'Unnamed',
      email: user.email || `${id}@guardian.test`,
      roleName: String(user.roleName || '').toLowerCase(),
      status: user.status || 'approved',
      organization: user.organization || null
    };
    store.users.set(id, record);
    return record;
  }

  function addPatient(patient) {
    const id = patient.id || newId();
    const record = {
      id,
      fullname: patient.fullname || 'Unnamed patient',
      dateOfBirth: patient.dateOfBirth || null,
      caretaker: patient.caretaker || null,
      assignedNurses: patient.assignedNurses || [],
      assignedDoctor: patient.assignedDoctor || null,
      organization: patient.organization || null
    };
    store.patients.set(id, record);
    return record;
  }

  function setRole(roleName, entry) {
    const key = normaliseRoleName(roleName);
    store.matrix.set(key, {
      roleName: key,
      displayName: entry.displayName || '',
      permissions: entry.permissions || [],
      inherits: (entry.inherits || []).map(normaliseRoleName),
      unscoped: Boolean(entry.unscoped),
      canGrant: Boolean(entry.canGrant),
      isSystem: Boolean(entry.isSystem),
      description: entry.description || ''
    });
  }

  function addRoleAssignment(assignment) {
    const id = assignment.id || newId();
    const record = {
      id,
      user: String(assignment.user),
      roleName: normaliseRoleName(assignment.roleName),
      isPrimary: Boolean(assignment.isPrimary),
      status: assignment.status || 'active',
      validFrom: assignment.validFrom || new Date(),
      validUntil: assignment.validUntil || null,
      assignedBy: assignment.assignedBy ? String(assignment.assignedBy) : null,
      assignedAt: assignment.assignedAt || new Date(),
      reason: assignment.reason || '',
      revokedBy: null,
      revokedAt: null,
      revocationReason: '',
      created_at: new Date()
    };
    store.assignments.set(id, record);
    return record;
  }

  function seedDefaultMatrix() {
    Object.entries(DEFAULT_ROLE_MATRIX).forEach(([roleName, permissions]) => {
      setRole(roleName, {
        permissions,
        inherits: [],
        isSystem: true,
        unscoped: DEFAULT_UNSCOPED_ROLES.includes(roleName),
        canGrant: DEFAULT_GRANTOR_ROLES.includes(roleName)
      });
    });
  }

  seedDefaultMatrix();
  (seed.users || []).forEach(addUser);
  (seed.patients || []).forEach(addPatient);

  /* ---------------- repository interface ---------------- */

  async function getRoleMatrix() {
    return Object.fromEntries(store.matrix.entries());
  }

  async function upsertRoleMatrix(roleName, patch) {
    const key = normaliseRoleName(roleName);
    const current =
      store.matrix.get(key) ||
      { roleName: key, displayName: '', permissions: [], inherits: [], unscoped: false, canGrant: false, isSystem: false, description: '' };
    const next = {
      ...current,
      ...(Array.isArray(patch.permissions) ? { permissions: patch.permissions } : {}),
      ...(Array.isArray(patch.inherits) ? { inherits: patch.inherits.map(normaliseRoleName) } : {}),
      ...(patch.displayName !== undefined ? { displayName: String(patch.displayName) } : {}),
      ...(patch.unscoped !== undefined ? { unscoped: Boolean(patch.unscoped) } : {}),
      ...(patch.canGrant !== undefined ? { canGrant: Boolean(patch.canGrant) } : {}),
      ...(patch.description !== undefined ? { description: String(patch.description) } : {})
    };
    store.matrix.set(key, next);
    return next;
  }

  async function createRole(roleName, data = {}) {
    const key = normaliseRoleName(roleName);
    if (store.matrix.get(key)) return { role: store.matrix.get(key), created: false };
    setRole(key, { ...data, isSystem: false });
    return { role: store.matrix.get(key), created: true };
  }

  async function deleteRole(roleName) {
    const key = normaliseRoleName(roleName);
    const existed = store.matrix.delete(key);
    return { deleted: existed };
  }

  /** Everything that would break if this role went away. */
  async function roleUsage(roleName) {
    const key = normaliseRoleName(roleName);
    const matrix = await getRoleMatrix();
    const primaryHolders = [...store.users.values()].filter((user) => user.roleName === key);
    const assignedHolders = [...store.assignments.values()].filter(
      (assignment) => assignment.roleName === key && assignment.status === 'active'
    );
    return {
      roleName: key,
      primaryHolders: primaryHolders.length,
      assignedHolders: assignedHolders.length,
      descendants: descendantsOf(key, matrix),
      isSystem: Boolean((matrix[key] || {}).isSystem)
    };
  }

  async function checkInheritanceCycle(childRole, parentRoles) {
    const matrix = await getRoleMatrix();
    return (parentRoles || []).filter((parent) => wouldCreateCycle(childRole, parent, matrix));
  }

  /* ---------------- role assignments ---------------- */

  function assignmentIsLive(assignment, now) {
    if (assignment.status !== 'active') return false;
    if (assignment.validFrom && new Date(assignment.validFrom) > now) return false;
    if (assignment.validUntil && new Date(assignment.validUntil) <= now) return false;
    return true;
  }

  async function activeRoleNames(userId) {
    const now = new Date();
    const user = store.users.get(String(userId));
    const names = [];
    if (user && user.roleName) names.push(normaliseRoleName(user.roleName));
    [...store.assignments.values()]
      .filter((assignment) => assignment.user === String(userId) && assignmentIsLive(assignment, now))
      .forEach((assignment) => names.push(assignment.roleName));
    return [...new Set(names.filter(Boolean))];
  }

  async function listRoleAssignments(filter = {}) {
    let rows = [...store.assignments.values()];
    if (filter.user) rows = rows.filter((row) => row.user === String(filter.user));
    if (filter.roleName) rows = rows.filter((row) => row.roleName === normaliseRoleName(filter.roleName));
    if (filter.status) rows = rows.filter((row) => row.status === filter.status);
    rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return {
      total: rows.length,
      assignments: rows.map((row) => ({
        ...row,
        userName: store.users.get(row.user)?.fullname || '',
        userEmail: store.users.get(row.user)?.email || '',
        assignedByName: store.users.get(row.assignedBy)?.fullname || ''
      }))
    };
  }

  async function findRoleAssignment({ userId, roleName, status = 'active' }) {
    return (
      [...store.assignments.values()].find(
        (row) =>
          row.user === String(userId) &&
          row.roleName === normaliseRoleName(roleName) &&
          row.status === status
      ) || null
    );
  }

  async function findRoleAssignmentById(assignmentId) {
    return store.assignments.get(String(assignmentId)) || null;
  }

  async function createRoleAssignment(data) {
    return addRoleAssignment(data);
  }

  async function updateRoleAssignment(assignmentId, patch) {
    const row = store.assignments.get(String(assignmentId));
    if (!row) return null;
    const next = { ...row, ...patch };
    store.assignments.set(String(assignmentId), next);
    return next;
  }

  async function getSubject(userId) {
    const user = store.users.get(String(userId));
    if (!user) return null;

    const matrix = await getRoleMatrix();
    const roleNames = await activeRoleNames(userId);
    const resolved = resolveRoles(roleNames, matrix);

    return {
      ...user,
      roleName: user.roleName,          // primary, for display and legacy callers
      roleNames: resolved.roleNames,    // effective set, union semantics
      capabilities: resolved.capabilities,
      unscoped: resolved.unscoped,
      canGrant: resolved.canGrant,
      roleChains: resolved.resolvedFrom
    };
  }

  async function getPatient(patientId) {
    return store.patients.get(String(patientId)) || null;
  }

  async function getRelatedPatientIds(subjectId) {
    const id = String(subjectId);
    return [...store.patients.values()]
      .filter(
        (patient) =>
          patient.caretaker === id ||
          patient.assignedDoctor === id ||
          (patient.assignedNurses || []).includes(id)
      )
      .map((patient) => patient.id);
  }

  async function getAllPatientIds() {
    return [...store.patients.keys()];
  }

  async function getGrants({ subjectId, patientId }) {
    return [...store.grants.values()].filter(
      (grant) =>
        (!subjectId || grant.subject === String(subjectId)) &&
        (!patientId || grant.patient === String(patientId))
    );
  }

  async function findGrantById(grantId) {
    return store.grants.get(String(grantId)) || null;
  }

  async function createGrant(data) {
    const id = newId();
    const grant = {
      id,
      subject: String(data.subject),
      patient: String(data.patient),
      permissions: data.permissions || [],
      grantType: data.grantType || 'explicit',
      status: data.status || 'active',
      validFrom: data.validFrom || new Date(),
      validUntil: data.validUntil || null,
      grantedBy: data.grantedBy ? String(data.grantedBy) : null,
      grantedByRole: data.grantedByRole || '',
      grantedAt: data.grantedAt || new Date(),
      reason: data.reason || '',
      purpose: data.purpose || 'direct-care',
      revokedBy: null,
      revokedAt: null,
      revocationReason: '',
      organization: data.organization || null,
      created_at: new Date()
    };
    store.grants.set(id, grant);
    return grant;
  }

  async function updateGrant(grantId, patch) {
    const grant = store.grants.get(String(grantId));
    if (!grant) return null;
    const next = { ...grant, ...patch };
    store.grants.set(String(grantId), next);
    return next;
  }

  async function listGrants(filter = {}, { page = 1, limit = 50 } = {}) {
    let rows = [...store.grants.values()];
    if (filter.subject) rows = rows.filter((grant) => grant.subject === String(filter.subject));
    if (filter.patient) rows = rows.filter((grant) => grant.patient === String(filter.patient));
    if (filter.status) rows = rows.filter((grant) => grant.status === filter.status);
    if (filter.grantType) rows = rows.filter((grant) => grant.grantType === filter.grantType);

    rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const total = rows.length;
    const paged = rows.slice((page - 1) * limit, page * limit);

    return {
      total,
      page,
      limit,
      grants: paged.map((grant) => ({
        ...grant,
        subjectName: store.users.get(grant.subject)?.fullname || '',
        subjectEmail: store.users.get(grant.subject)?.email || '',
        patientName: store.patients.get(grant.patient)?.fullname || '',
        grantedByName: store.users.get(grant.grantedBy)?.fullname || ''
      }))
    };
  }

  async function writeAudit(entry) {
    const row = { id: newId(), ...entry, at: entry.at || new Date() };
    store.audit.push(row);
    return { id: row.id };
  }

  async function listAudit(filter = {}, { page = 1, limit = 100 } = {}) {
    let rows = [...store.audit];
    if (filter.subject) rows = rows.filter((row) => String(row.subject) === String(filter.subject));
    if (filter.patient) rows = rows.filter((row) => String(row.patient) === String(filter.patient));
    if (filter.event) rows = rows.filter((row) => row.event === filter.event);
    if (filter.allowed !== undefined && filter.allowed !== null) {
      rows = rows.filter((row) => row.allowed === filter.allowed);
    }

    rows.sort((a, b) => new Date(b.at) - new Date(a.at));
    const total = rows.length;

    return {
      total,
      page,
      limit,
      entries: rows.slice((page - 1) * limit, page * limit).map((row) => ({
        ...row,
        subjectName: store.users.get(String(row.subject))?.fullname || '',
        patientName: store.patients.get(String(row.patient))?.fullname || '',
        actorName: store.users.get(String(row.actor))?.fullname || ''
      }))
    };
  }

  async function listUsers({ search, role, limit = 100 } = {}) {
    let rows = [...store.users.values()];
    if (search) {
      const needle = String(search).toLowerCase();
      rows = rows.filter(
        (user) =>
          user.fullname.toLowerCase().includes(needle) || user.email.toLowerCase().includes(needle)
      );
    }
    if (role) rows = rows.filter((user) => user.roleName === normaliseRoleName(role));

    const now = new Date();
    return rows.slice(0, limit).map((user) => ({
      ...user,
      roleNames: [
        ...new Set([
          user.roleName,
          ...[...store.assignments.values()]
            .filter((assignment) => assignment.user === user.id && assignmentIsLive(assignment, now))
            .map((assignment) => assignment.roleName)
        ].filter(Boolean))
      ]
    }));
  }

  async function listPatients({ search, limit = 100 } = {}) {
    let rows = [...store.patients.values()];
    if (search) {
      const needle = String(search).toLowerCase();
      rows = rows.filter((patient) => patient.fullname.toLowerCase().includes(needle));
    }
    return rows.slice(0, limit);
  }

  return {
    name: 'memory',
    isValidId: () => true, // ids are opaque in memory mode
    store,
    addUser,
    addPatient,
    setRole,
    addRoleAssignment,
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

module.exports = { createMemoryRepository, newId, isValidId };
