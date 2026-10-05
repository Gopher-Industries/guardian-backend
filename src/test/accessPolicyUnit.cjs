/**
 * Guardian — access-control policy engine unit tests.
 *
 * The decision table, proved directly against the pure engine. No database, no
 * express, no clock dependency: every case hands the engine explicit data and
 * asserts the verdict AND the reason code, because "denied" without a reason is
 * not something you can operate.
 *
 * Run:  npx mocha src/test/accessPolicyUnit.cjs --exit
 *
 * @author   Graeme Thomas
 * @module   guardian-access-control
 * @version  1.1.0
 */

'use strict';

const { expect } = require('chai');
const policy = require('../access/policy');
const { REASONS } = policy;

const NOW = new Date('2026-09-08T10:00:00Z');
const minutes = (n) => new Date(NOW.getTime() + n * 60 * 1000);

const CAPS = {
  analyst: ['patient:read', 'patient.vitals:read'],
  nurse: ['patient:read', 'patient.vitals:read', 'patient.log:read', 'patient.log:write'],
  doctor: ['patient:read', 'patient.prescription:read', 'patient.prescription:write'],
  admin: ['*']
};

function subject(overrides = {}) {
  return Object.assign(
    { id: 'user-analyst', roleName: 'analyst', status: 'approved', capabilities: CAPS.analyst },
    overrides
  );
}

function patient(overrides = {}) {
  return Object.assign(
    { id: 'patient-1', caretaker: 'user-caretaker', assignedNurses: ['user-nurse'], assignedDoctor: 'user-doctor', organization: 'org-1' },
    overrides
  );
}

function grant(overrides = {}) {
  return Object.assign(
    {
      id: 'grant-1',
      subject: 'user-analyst',
      patient: 'patient-1',
      permissions: ['patient:read'],
      grantType: 'explicit',
      status: 'active',
      validFrom: minutes(-60),
      validUntil: null
    },
    overrides
  );
}

/** Strict mode: explicit authorisation only, no implicit care relationships. */
const STRICT = { unscopedRoles: ['admin'], allowRelationshipAccess: false, maskUnknownPatient: true };
const RELAXED = { unscopedRoles: ['admin'], allowRelationshipAccess: true, maskUnknownPatient: true };

function evaluate(input) {
  return policy.evaluate(Object.assign({ now: NOW, options: STRICT }, input));
}

describe('access policy — capability layer (role matrix)', () => {
  it('denies a permission the role does not carry, before scope is even considered', () => {
    const decision = evaluate({
      subject: subject(),
      patient: patient(),
      permission: 'patient.prescription:write',
      grants: [grant({ permissions: ['*'] })] // even a wildcard grant cannot lift the role ceiling
    });

    expect(decision.allowed).to.equal(false);
    expect(decision.reason).to.equal(REASONS.DENY_ROLE_LACKS_CAPABILITY);
  });

  it('allows a permission the role carries once scope is satisfied', () => {
    const decision = evaluate({
      subject: subject(),
      patient: patient(),
      permission: 'patient:read',
      grants: [grant()]
    });

    expect(decision.allowed).to.equal(true);
    expect(decision.reason).to.equal(REASONS.ALLOW_EXPLICIT_GRANT);
  });

  it('honours wildcard capabilities', () => {
    const decision = evaluate({
      subject: subject({ id: 'user-admin', roleName: 'admin', capabilities: CAPS.admin }),
      patient: patient(),
      permission: 'patient.prescription:write'
    });

    expect(decision.allowed).to.equal(true);
    expect(decision.reason).to.equal(REASONS.ALLOW_ROLE_UNSCOPED);
  });

  it('rejects an inactive account regardless of role or grant', () => {
    const decision = evaluate({
      subject: subject({ status: 'deactivated' }),
      patient: patient(),
      permission: 'patient:read',
      grants: [grant()]
    });

    expect(decision.allowed).to.equal(false);
    expect(decision.reason).to.equal(REASONS.DENY_SUBJECT_INACTIVE);
  });

  it('rejects an unresolvable subject with 401, not 403', () => {
    const decision = evaluate({ subject: null, patient: patient(), permission: 'patient:read' });
    expect(decision.allowed).to.equal(false);
    expect(decision.status).to.equal(401);
    expect(decision.reason).to.equal(REASONS.DENY_SUBJECT_UNKNOWN);
  });
});

describe('access policy — scope layer (patient grants)', () => {
  it('DENIES a capable user with no grant — the core requirement', () => {
    const decision = evaluate({ subject: subject(), patient: patient(), permission: 'patient:read', grants: [] });

    expect(decision.allowed).to.equal(false);
    expect(decision.reason).to.equal(REASONS.DENY_NO_GRANT);
    expect(decision.status).to.equal(403);
  });

  it('does not leak a grant issued for a different patient', () => {
    const decision = evaluate({
      subject: subject(),
      patient: patient({ id: 'patient-2' }),
      permission: 'patient:read',
      grants: [grant({ patient: 'patient-1' })]
    });

    expect(decision.allowed).to.equal(false);
    expect(decision.reason).to.equal(REASONS.DENY_NO_GRANT);
  });

  it('does not honour a grant issued to a different user', () => {
    const decision = evaluate({
      subject: subject({ id: 'user-other' }),
      patient: patient(),
      permission: 'patient:read',
      grants: [grant({ subject: 'user-analyst' })]
    });

    expect(decision.allowed).to.equal(false);
    expect(decision.reason).to.equal(REASONS.DENY_NO_GRANT);
  });

  it('denies when the grant conveys a narrower permission than the one requested', () => {
    const decision = evaluate({
      subject: subject(),
      patient: patient(),
      permission: 'patient.vitals:read',
      grants: [grant({ permissions: ['patient:read'] })]
    });

    expect(decision.allowed).to.equal(false);
    expect(decision.reason).to.equal(REASONS.DENY_GRANT_LACKS_PERMISSION);
  });

  it('supports prefix wildcards inside a grant', () => {
    const decision = evaluate({
      subject: subject(),
      patient: patient(),
      permission: 'patient.vitals:read',
      grants: [grant({ permissions: ['patient.*'] })]
    });

    expect(decision.allowed).to.equal(true);
  });
});

describe('access policy — grant lifecycle', () => {
  it('denies an expired grant and says so', () => {
    const decision = evaluate({
      subject: subject(),
      patient: patient(),
      permission: 'patient:read',
      grants: [grant({ validUntil: minutes(-1) })]
    });

    expect(decision.allowed).to.equal(false);
    expect(decision.reason).to.equal(REASONS.DENY_GRANT_EXPIRED);
  });

  it('denies a grant that has not started yet', () => {
    const decision = evaluate({
      subject: subject(),
      patient: patient(),
      permission: 'patient:read',
      grants: [grant({ validFrom: minutes(60) })]
    });

    expect(decision.allowed).to.equal(false);
    expect(decision.reason).to.equal(REASONS.DENY_GRANT_NOT_YET_VALID);
  });

  it('denies a revoked grant', () => {
    const decision = evaluate({
      subject: subject(),
      patient: patient(),
      permission: 'patient:read',
      grants: [grant({ status: 'revoked' })]
    });

    expect(decision.allowed).to.equal(false);
    expect(decision.reason).to.equal(REASONS.DENY_GRANT_REVOKED);
  });

  it('allows when one grant is dead but another live grant covers the request', () => {
    const decision = evaluate({
      subject: subject(),
      patient: patient(),
      permission: 'patient:read',
      grants: [grant({ id: 'dead', status: 'revoked' }), grant({ id: 'live' })]
    });

    expect(decision.allowed).to.equal(true);
    expect(decision.grantId).to.equal('live');
  });

  it('allows a live break-glass grant and labels it as such', () => {
    const decision = evaluate({
      subject: subject(),
      patient: patient(),
      permission: 'patient:read',
      grants: [grant({ grantType: 'break-glass', validUntil: minutes(30) })]
    });

    expect(decision.allowed).to.equal(true);
    expect(decision.reason).to.equal(REASONS.ALLOW_BREAK_GLASS);
  });

  it('stops honouring a break-glass grant the moment its window closes', () => {
    const decision = evaluate({
      subject: subject(),
      patient: patient(),
      permission: 'patient:read',
      grants: [grant({ grantType: 'break-glass', validUntil: minutes(-1) })]
    });

    expect(decision.allowed).to.equal(false);
    expect(decision.reason).to.equal(REASONS.DENY_GRANT_EXPIRED);
  });
});

describe('access policy — care relationships', () => {
  it('in relaxed mode an assigned nurse needs no explicit grant', () => {
    const decision = policy.evaluate({
      now: NOW,
      options: RELAXED,
      subject: subject({ id: 'user-nurse', roleName: 'nurse', capabilities: CAPS.nurse }),
      patient: patient(),
      permission: 'patient:read',
      grants: []
    });

    expect(decision.allowed).to.equal(true);
    expect(decision.reason).to.equal(REASONS.ALLOW_RELATIONSHIP);
    expect(decision.relationship).to.equal('assignedNurse');
  });

  it('in strict mode the same nurse is denied without an explicit grant', () => {
    const decision = evaluate({
      subject: subject({ id: 'user-nurse', roleName: 'nurse', capabilities: CAPS.nurse }),
      patient: patient(),
      permission: 'patient:read',
      grants: []
    });

    expect(decision.allowed).to.equal(false);
    expect(decision.reason).to.equal(REASONS.DENY_NO_GRANT);
  });
});

describe('access policy — information disclosure', () => {
  it('masks an unknown patient as 403, so ids cannot be probed', () => {
    const decision = evaluate({ subject: subject(), patient: null, permission: 'patient:read' });

    expect(decision.status).to.equal(403);
    expect(decision.reason).to.equal(REASONS.DENY_PATIENT_UNKNOWN);
    expect(decision.message).to.not.match(/not found/i);
  });

  it('can be configured to distinguish 404 for internal tooling', () => {
    const decision = policy.evaluate({
      now: NOW,
      options: Object.assign({}, STRICT, { maskUnknownPatient: false }),
      subject: subject(),
      patient: null,
      permission: 'patient:read'
    });

    expect(decision.status).to.equal(404);
  });
});

describe('access policy — list scoping', () => {
  const grants = [
    grant({ id: 'g1', patient: 'patient-1' }),
    grant({ id: 'g2', patient: 'patient-2', status: 'revoked' }),
    grant({ id: 'g3', patient: 'patient-3', validUntil: minutes(-5) }),
    grant({ id: 'g4', patient: 'patient-4', permissions: ['patient.log:read'] })
  ];

  it('returns only the patients covered by a live grant carrying the permission', () => {
    const ids = policy.filterAuthorisedPatientIds({
      now: NOW,
      options: STRICT,
      subject: subject(),
      permission: 'patient:read',
      grants
    });

    expect(ids).to.deep.equal(['patient-1']);
  });

  it('returns every patient for an unscoped role', () => {
    const ids = policy.filterAuthorisedPatientIds({
      now: NOW,
      options: STRICT,
      subject: subject({ id: 'user-admin', roleName: 'admin', capabilities: CAPS.admin }),
      permission: 'patient:read',
      grants: [],
      allPatientIds: ['patient-1', 'patient-2', 'patient-9']
    });

    expect(ids).to.have.members(['patient-1', 'patient-2', 'patient-9']);
  });

  it('returns nothing when the role lacks the capability, whatever the grants say', () => {
    const ids = policy.filterAuthorisedPatientIds({
      now: NOW,
      options: STRICT,
      subject: subject(),
      permission: 'patient.prescription:write',
      grants
    });

    expect(ids).to.deep.equal([]);
  });
});
