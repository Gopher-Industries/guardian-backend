'use strict';

/**
 * Guardian — permission catalogue and default role capability matrix.
 *
 * Two independent dimensions:
 *
 *   CAPABILITY  "what kind of action may this role ever perform?"   -> this file
 *   SCOPE       "for WHICH patients may they perform it?"           -> PatientAccessGrant
 *
 * Effective permission = CAPABILITY  AND  SCOPE.
 *
 * The matrix below is only the *seed default*. Once seedAccessControl.js has
 * run, the live matrix lives in the RolePermissionSet collection and is edited
 * through the admin console, so nobody has to redeploy to change a role.
 *
 * @author   Graeme Thomas
 * @module   guardian-access-control
 * @version  1.1.0
 */

/* ------------------------------------------------------------------ *
 * Permission catalogue
 * ------------------------------------------------------------------ */

const PERMISSIONS = [
  // Patient demographic / clinical record
  { code: 'patient:read', category: 'patient', description: 'View patient demographic and summary record' },
  { code: 'patient:write', category: 'patient', description: 'Create or amend a patient record' },

  // Clinical sub-resources
  { code: 'patient.vitals:read', category: 'clinical', description: 'View vitals, activity and sensor-derived data' },
  { code: 'patient.prescription:read', category: 'clinical', description: 'View prescriptions' },
  { code: 'patient.prescription:write', category: 'clinical', description: 'Issue or amend prescriptions' },
  { code: 'patient.careplan:read', category: 'clinical', description: 'View care plans' },
  { code: 'patient.careplan:write', category: 'clinical', description: 'Author or amend care plans' },
  { code: 'patient.log:read', category: 'clinical', description: 'View patient logs and daily reports' },
  { code: 'patient.log:write', category: 'clinical', description: 'Record patient logs and daily reports' },

  // Administration of the access-control system itself
  { code: 'access.grant:manage', category: 'access', description: 'Issue and revoke patient access grants' },
  { code: 'access.matrix:manage', category: 'access', description: 'Edit the role capability matrix' },
  { code: 'access.audit:read', category: 'access', description: 'Read the access decision audit log' },
  { code: 'access.breakglass:use', category: 'access', description: 'Invoke emergency break-glass access' }
];

const PERMISSION_CODES = PERMISSIONS.map((permission) => permission.code);

/**
 * Permissions that are *never* patient-scoped. They are system-wide
 * capabilities, so requirePatientAccess() is not used for them.
 */
const UNSCOPED_PERMISSIONS = new Set([
  'access.grant:manage',
  'access.matrix:manage',
  'access.audit:read'
]);

/* ------------------------------------------------------------------ *
 * Default role capability matrix
 * ------------------------------------------------------------------ */

const DEFAULT_ROLE_MATRIX = {
  admin: ['*'],

  doctor: [
    'patient:read',
    'patient:write',
    'patient.vitals:read',
    'patient.prescription:read',
    'patient.prescription:write',
    'patient.careplan:read',
    'patient.careplan:write',
    'patient.log:read',
    'patient.log:write',
    'access.grant:manage',
    'access.audit:read',
    'access.breakglass:use'
  ],

  nurse: [
    'patient:read',
    'patient.vitals:read',
    'patient.prescription:read',
    'patient.careplan:read',
    'patient.log:read',
    'patient.log:write',
    'access.breakglass:use'
  ],

  caretaker: [
    'patient:read',
    'patient.vitals:read',
    'patient.careplan:read',
    'patient.log:read',
    'patient.log:write'
  ],

  // The "system user" in the brief: may read patient data, but only ever for
  // patients a doctor or administrator has explicitly authorised.
  analyst: [
    'patient:read',
    'patient.vitals:read'
  ]
};

/**
 * Roles whose scope is global — they do not need a per-patient grant.
 * Deliberately tiny. Everyone else, doctors included, is patient-scoped.
 */
const DEFAULT_UNSCOPED_ROLES = ['admin'];

/**
 * Roles permitted to issue and revoke grants (enforced additionally by the
 * access.grant:manage capability).
 */
const DEFAULT_GRANTOR_ROLES = ['admin', 'doctor'];

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

function normalisePermission(code) {
  return String(code || '').trim().toLowerCase();
}

/**
 * Expand a stored capability list into a matcher.
 *
 * Supports:
 *   '*'                    every permission
 *   'patient.*'            every permission whose code starts with 'patient.'
 *   'patient:read'         exact
 */
function buildCapabilityMatcher(capabilityList) {
  const entries = (capabilityList || []).map(normalisePermission).filter(Boolean);
  const exact = new Set(entries.filter((entry) => !entry.includes('*')));
  const wildcards = entries.filter((entry) => entry.includes('*'));
  const allowAll = wildcards.includes('*');

  return function hasCapability(code) {
    const permission = normalisePermission(code);
    if (!permission) return false;
    if (allowAll) return true;
    if (exact.has(permission)) return true;
    return wildcards.some((pattern) => {
      if (pattern === '*') return true;
      const prefix = pattern.replace(/\*+$/, '');
      return prefix.length > 0 && permission.startsWith(prefix);
    });
  };
}

/**
 * Is `granted` sufficient to satisfy `required`?
 * Used when checking the permission list carried on an individual grant.
 */
function grantCovers(grantedPermissions, requiredPermission) {
  return buildCapabilityMatcher(grantedPermissions)(requiredPermission);
}

function isKnownPermission(code) {
  const permission = normalisePermission(code);
  return permission === '*' || permission.endsWith('*') || PERMISSION_CODES.includes(permission);
}

module.exports = {
  PERMISSIONS,
  PERMISSION_CODES,
  UNSCOPED_PERMISSIONS,
  DEFAULT_ROLE_MATRIX,
  DEFAULT_UNSCOPED_ROLES,
  DEFAULT_GRANTOR_ROLES,
  normalisePermission,
  buildCapabilityMatcher,
  grantCovers,
  isKnownPermission
};
