'use strict';

/**
 * Guardian — access-control policy engine.
 *
 * This module is deliberately PURE: no mongoose, no express, no clock beyond
 * the `now` you pass in. Everything it needs is handed to it as plain data.
 * That is what makes the model provable — the whole decision table can be
 * exercised without a database (see src/test/accessPolicyUnit.cjs and
 * src/test/harness/proveConcept.cjs).
 *
 * Decision order (first match wins):
 *
 *   0. subject resolvable and active?        -> else DENY
 *   1. role holds the capability at all?     -> else DENY (capability layer)
 *   2. role is unscoped (admin)?             -> ALLOW
 *   3. any live grant covering the permission -> ALLOW, labelled
 *      ALLOW_BREAK_GLASS or ALLOW_EXPLICIT_GRANT by the grant's own type.
 *      Grants are not ranked against each other: the first usable one wins,
 *      because both convey exactly the permissions they list.
 *   4. care relationship, if enabled?        -> ALLOW
 *   5.                                       -> DENY
 *
 * @author   Graeme Thomas
 * @module   guardian-access-control
 * @version  1.1.0
 */

const { buildCapabilityMatcher, grantCovers } = require('./permissions');

const REASONS = {
  ALLOW_ROLE_UNSCOPED: 'ALLOW_ROLE_UNSCOPED',
  ALLOW_BREAK_GLASS: 'ALLOW_BREAK_GLASS',
  ALLOW_EXPLICIT_GRANT: 'ALLOW_EXPLICIT_GRANT',
  ALLOW_RELATIONSHIP: 'ALLOW_RELATIONSHIP',

  DENY_SUBJECT_UNKNOWN: 'DENY_SUBJECT_UNKNOWN',
  DENY_SUBJECT_INACTIVE: 'DENY_SUBJECT_INACTIVE',
  DENY_ROLE_LACKS_CAPABILITY: 'DENY_ROLE_LACKS_CAPABILITY',
  DENY_PATIENT_UNKNOWN: 'DENY_PATIENT_UNKNOWN',
  DENY_NO_GRANT: 'DENY_NO_GRANT',
  DENY_GRANT_REVOKED: 'DENY_GRANT_REVOKED',
  DENY_GRANT_SUSPENDED: 'DENY_GRANT_SUSPENDED',
  DENY_GRANT_EXPIRED: 'DENY_GRANT_EXPIRED',
  DENY_GRANT_NOT_YET_VALID: 'DENY_GRANT_NOT_YET_VALID',
  DENY_GRANT_LACKS_PERMISSION: 'DENY_GRANT_LACKS_PERMISSION'
};

const GRANT_STATUS = {
  ACTIVE: 'active',
  REVOKED: 'revoked',
  SUSPENDED: 'suspended'
};

const GRANT_TYPE = {
  EXPLICIT: 'explicit',
  BREAK_GLASS: 'break-glass'
};

const DEFAULT_OPTIONS = {
  /** Roles that bypass patient scoping entirely. */
  unscopedRoles: ['admin'],
  /**
   * When true, an existing care relationship (caretaker / assignedNurses /
   * assignedDoctor) acts as an implicit grant. Set false for strict
   * "explicit authorisation only" mode — the mode the brief describes.
   */
  allowRelationshipAccess: true,
  /**
   * When true, "patient does not exist" and "you are not authorised for this
   * patient" produce the same outward answer, so the API cannot be used to
   * probe which patient identifiers are real. The true reason is still
   * recorded in the audit log.
   */
  maskUnknownPatient: true
};

function idOf(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object') {
    const candidate = value._id !== undefined ? value._id : value.id;
    return candidate === undefined ? String(value) : String(candidate);
  }
  return String(value);
}

function sameId(left, right) {
  const a = idOf(left);
  const b = idOf(right);
  return Boolean(a) && Boolean(b) && a === b;
}

function toDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Classify a single grant against the request. Returns a rank so the engine
 * can report the most informative denial when nothing is usable.
 *
 *   0 usable       1 lacks permission     2 not yet valid
 *   3 expired      4 suspended/revoked
 */
function classifyGrant(grant, permission, now) {
  if (grant.status === GRANT_STATUS.REVOKED) {
    return { rank: 4, reason: REASONS.DENY_GRANT_REVOKED };
  }
  if (grant.status === GRANT_STATUS.SUSPENDED) {
    return { rank: 4, reason: REASONS.DENY_GRANT_SUSPENDED };
  }

  const validFrom = toDate(grant.validFrom);
  const validUntil = toDate(grant.validUntil);

  if (validFrom && now < validFrom) {
    return { rank: 2, reason: REASONS.DENY_GRANT_NOT_YET_VALID };
  }
  if (validUntil && now >= validUntil) {
    return { rank: 3, reason: REASONS.DENY_GRANT_EXPIRED };
  }
  if (!grantCovers(grant.permissions, permission)) {
    return { rank: 1, reason: REASONS.DENY_GRANT_LACKS_PERMISSION };
  }

  return { rank: 0, reason: null };
}

/** A subject may hold several roles; older callers pass a single roleName. */
function rolesOf(subject) {
  const many = subject && subject.roleNames;
  if (Array.isArray(many) && many.length) {
    return many.map((role) => String(role).toLowerCase());
  }
  const one = subject && subject.roleName;
  return one ? [String(one).toLowerCase()] : [];
}

function relationshipFor(subject, patient) {
  if (!patient) return null;
  if (sameId(patient.caretaker, subject.id)) return 'caretaker';
  if (sameId(patient.assignedDoctor, subject.id)) return 'assignedDoctor';
  const nurses = patient.assignedNurses || [];
  if (nurses.some((nurseId) => sameId(nurseId, subject.id))) return 'assignedNurse';
  return null;
}

function decision(allowed, reason, extra) {
  return Object.assign(
    {
      allowed,
      reason,
      status: allowed ? 200 : 403,
      message: allowed ? 'Authorised' : 'You are not authorised to access this patient record',
      grantId: null,
      grantType: null,
      relationship: null
    },
    extra || {}
  );
}

/**
 * Evaluate one access request.
 *
 * @param {object}   input
 * @param {object}   input.subject      { id, roleName, status, capabilities[] }
 * @param {object}   [input.patient]    { id, caretaker, assignedNurses[], assignedDoctor, organization }
 * @param {string}   input.permission   e.g. 'patient:read'
 * @param {object[]} [input.grants]     grants already narrowed to this subject+patient
 * @param {Date}     [input.now]
 * @param {object}   [input.options]
 * @returns {{allowed:boolean, reason:string, status:number, message:string,
 *            grantId:?string, grantType:?string, relationship:?string}}
 */
function evaluate(input) {
  const options = Object.assign({}, DEFAULT_OPTIONS, input.options || {});
  const now = toDate(input.now) || new Date();
  const permission = String(input.permission || '').trim().toLowerCase();
  const subject = input.subject;

  /* -------- 0. subject -------- */
  if (!subject || !subject.id) {
    return decision(false, REASONS.DENY_SUBJECT_UNKNOWN, {
      status: 401,
      message: 'Authenticated user could not be resolved'
    });
  }

  const subjectStatus = String(subject.status || 'approved').toLowerCase();
  if (subjectStatus !== 'approved' && subjectStatus !== 'active') {
    return decision(false, REASONS.DENY_SUBJECT_INACTIVE, {
      message: 'Your account is not active'
    });
  }

  /* -------- 1. capability layer (role matrix) -------- */
  const hasCapability = buildCapabilityMatcher(subject.capabilities);
  if (!hasCapability(permission)) {
    return decision(false, REASONS.DENY_ROLE_LACKS_CAPABILITY, {
      message: `Your role does not carry the '${permission}' permission`
    });
  }

  /* -------- 2. unscoped roles -------- */
  /* Union semantics: holding ONE unscoped role is enough. */
  const heldRoles = rolesOf(subject);
  const unscoped = (options.unscopedRoles || []).map((role) => String(role).toLowerCase());
  if (heldRoles.some((role) => unscoped.includes(role))) {
    return decision(true, REASONS.ALLOW_ROLE_UNSCOPED);
  }

  /* Everything past here is patient-scoped. */
  const patient = input.patient;
  if (!patient || !patient.id) {
    return decision(false, REASONS.DENY_PATIENT_UNKNOWN, {
      status: options.maskUnknownPatient ? 403 : 404,
      message: options.maskUnknownPatient
        ? 'You are not authorised to access this patient record'
        : 'Patient not found'
    });
  }

  /* -------- 3. grants -------- */
  const grants = input.grants || [];
  let bestDenial = null;

  for (const grant of grants) {
    if (!sameId(grant.subject, subject.id)) continue;
    if (!sameId(grant.patient, patient.id)) continue;

    const verdict = classifyGrant(grant, permission, now);
    if (verdict.rank === 0) {
      const isBreakGlass = grant.grantType === GRANT_TYPE.BREAK_GLASS;
      return decision(true, isBreakGlass ? REASONS.ALLOW_BREAK_GLASS : REASONS.ALLOW_EXPLICIT_GRANT, {
        grantId: idOf(grant.id || grant._id),
        grantType: grant.grantType || GRANT_TYPE.EXPLICIT
      });
    }

    if (!bestDenial || verdict.rank < bestDenial.rank) {
      bestDenial = { rank: verdict.rank, reason: verdict.reason, grantId: idOf(grant.id || grant._id) };
    }
  }

  /* -------- 4. care relationship (optional) -------- */
  if (options.allowRelationshipAccess) {
    const relationship = relationshipFor(subject, patient);
    if (relationship) {
      return decision(true, REASONS.ALLOW_RELATIONSHIP, { relationship });
    }
  }

  /* -------- 5. deny -------- */
  if (bestDenial) {
    return decision(false, bestDenial.reason, { grantId: bestDenial.grantId });
  }
  return decision(false, REASONS.DENY_NO_GRANT);
}

/**
 * Which patients may this subject reach with `permission`?
 * Returns the ids drawn from grants plus, when enabled, care relationships.
 * The caller supplies the candidate sets; this stays pure.
 */
function filterAuthorisedPatientIds(input) {
  const options = Object.assign({}, DEFAULT_OPTIONS, input.options || {});
  const now = toDate(input.now) || new Date();
  const permission = String(input.permission || '').trim().toLowerCase();
  const subject = input.subject;

  if (!subject || !subject.id) return [];

  const hasCapability = buildCapabilityMatcher(subject.capabilities);
  if (!hasCapability(permission)) return [];

  const heldRoles = rolesOf(subject);
  const unscoped = (options.unscopedRoles || []).map((role) => String(role).toLowerCase());
  if (heldRoles.some((role) => unscoped.includes(role))) {
    return (input.allPatientIds || []).map(idOf);
  }

  const allowed = new Set();

  for (const grant of input.grants || []) {
    if (!sameId(grant.subject, subject.id)) continue;
    if (classifyGrant(grant, permission, now).rank === 0) {
      allowed.add(idOf(grant.patient));
    }
  }

  if (options.allowRelationshipAccess) {
    for (const patientId of input.relatedPatientIds || []) {
      allowed.add(idOf(patientId));
    }
  }

  return [...allowed].filter(Boolean);
}

module.exports = {
  REASONS,
  GRANT_STATUS,
  GRANT_TYPE,
  DEFAULT_OPTIONS,
  evaluate,
  filterAuthorisedPatientIds,
  rolesOf,
  classifyGrant,
  relationshipFor,
  idOf,
  sameId
};
