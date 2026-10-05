/**
 * Guardian — hardening regression tests.
 *
 * Author: Graeme Thomas
 *
 * One test per issue found in the code review pass. These are the cases that
 * were wrong before the review and are now right — kept so they stay right.
 *
 * Run:  npx mocha src/test/accessHardening.cjs --exit
 *
 * @author   Graeme Thomas
 * @module   guardian-access-control
 * @version  1.1.0
 */

'use strict';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'gmproject';

const chai = require('chai');
const chaiHttp = require('chai-http');

const { buildWorld, authHeader } = require('./helpers/accessTestApp.cjs');

chai.use(chaiHttp);
const { expect } = chai;

const RECORD = (patientId) => `/api/v1/access/demo/patients/${patientId}/record`;

describe('hardening — grant lifecycle reason codes', () => {
  let world;
  beforeEach(() => { world = buildWorld(); });

  it('a suspended grant reports DENY_GRANT_SUSPENDED, not DENY_GRANT_REVOKED', async () => {
    await world.repository.createGrant({
      subject: world.ids.analyst,
      patient: world.ids.alice,
      permissions: ['patient:read'],
      grantedBy: world.ids.drHouse,
      reason: 'Under review',
      status: 'suspended'
    });

    const res = await chai
      .request(world.app)
      .get(RECORD(world.ids.alice))
      .set('Authorization', authHeader(world.users.analyst));

    expect(res).to.have.status(403);
    expect(res.body.reason).to.equal('DENY_GRANT_SUSPENDED');
  });
});

describe('hardening — date validation on grants', () => {
  let world;
  beforeEach(() => { world = buildWorld(); });

  function issue(body) {
    return chai
      .request(world.app)
      .post('/api/v1/access/grants')
      .set('Authorization', authHeader(world.users.drHouse))
      .send(Object.assign(
        {
          subjectId: world.ids.analyst,
          patientId: world.ids.alice,
          permissions: ['patient:read'],
          reason: 'Date validation test'
        },
        body
      ));
  }

  it('rejects an unparseable validUntil instead of creating a grant that never expires', async () => {
    const res = await issue({ validUntil: 'next tuesday-ish' });
    expect(res).to.have.status(400);
    expect(res.body.code).to.equal('INVALID_DATE');
  });

  it('rejects a validUntil that has already passed', async () => {
    const res = await issue({ validUntil: new Date(Date.now() - 3600000).toISOString() });
    expect(res).to.have.status(400);
    expect(res.body.code).to.equal('GRANT_ALREADY_EXPIRED');
  });

  it('rejects a validUntil that precedes validFrom', async () => {
    const res = await issue({
      validFrom: new Date(Date.now() + 7200000).toISOString(),
      validUntil: new Date(Date.now() + 3600000).toISOString()
    });
    expect(res).to.have.status(400);
    expect(res.body.code).to.equal('INVALID_DATE_RANGE');
  });

  it('still accepts a well-formed future window', async () => {
    const res = await issue({ validUntil: new Date(Date.now() + 86400000).toISOString() });
    expect(res).to.have.status(201);
  });
});

describe('hardening — break glass', () => {
  let world;
  beforeEach(() => {
    world = buildWorld();
    world.suspendedNurse = world.repository.addUser({
      fullname: 'Suspended Nurse',
      email: 'suspended@guardian.test',
      roleName: 'nurse',
      status: 'deactivated'
    });
  });

  function breakGlass(actor, body) {
    return chai
      .request(world.app)
      .post('/api/v1/access/break-glass')
      .set('Authorization', authHeader(actor))
      .send(Object.assign(
        { patientId: world.ids.bob, reason: 'Resident unresponsive, on-call doctor unreachable' },
        body
      ));
  }

  it('a deactivated account cannot take emergency access', async () => {
    const res = await breakGlass(world.suspendedNurse);
    expect(res).to.have.status(403);
    expect(res.body.code).to.equal('SUBJECT_INACTIVE');
  });

  it('a negative window is clamped, not honoured', async () => {
    const res = await breakGlass(world.users.nurseJoy, { minutes: -30 });
    expect(res).to.have.status(201);
    expect(new Date(res.body.expiresAt)).to.be.above(new Date());
  });

  it('a non-numeric window falls back to the configured maximum', async () => {
    const res = await breakGlass(world.users.nurseJoy, { minutes: 'as long as I need' });
    expect(res).to.have.status(201);

    const windowMs = new Date(res.body.expiresAt) - Date.now();
    expect(windowMs).to.be.above(0);
    expect(windowMs).to.be.at.most(61 * 60 * 1000);
  });

  it('a clamped window still actually opens the record', async () => {
    await breakGlass(world.users.nurseJoy, { minutes: -30 });
    const res = await chai
      .request(world.app)
      .get(RECORD(world.ids.bob))
      .set('Authorization', authHeader(world.users.nurseJoy));

    expect(res).to.have.status(200);
    expect(res.body.authorisedBy).to.equal('ALLOW_BREAK_GLASS');
  });
});

describe('hardening — wildcard escalation', () => {
  let world;
  beforeEach(() => {
    world = buildWorld();
    world.repository.setRole('role-admin', {
      permissions: ['patient:read', 'access.matrix:manage'],
      unscoped: false,
      canGrant: false
    });
    world.roleAdmin = world.repository.addUser({
      fullname: 'Role Admin',
      email: 'roleadmin@guardian.test',
      roleName: 'role-admin'
    });
  });

  it('a non-unscoped role administrator cannot give a role wildcard permissions', async () => {
    const res = await chai
      .request(world.app)
      .put('/api/v1/access/roles/role-admin')
      .set('Authorization', authHeader(world.roleAdmin))
      .send({ permissions: ['*'] });

    expect(res).to.have.status(403);
    expect(res.body.code).to.equal('WILDCARD_FORBIDDEN');
  });

  it('nor create a new role holding one', async () => {
    const res = await chai
      .request(world.app)
      .post('/api/v1/access/roles')
      .set('Authorization', authHeader(world.roleAdmin))
      .send({ roleName: 'everything', permissions: ['patient.*'] });

    expect(res).to.have.status(403);
    expect(res.body.code).to.equal('WILDCARD_FORBIDDEN');
  });

  it('an unscoped administrator still can', async () => {
    const res = await chai
      .request(world.app)
      .post('/api/v1/access/roles')
      .set('Authorization', authHeader(world.users.admin))
      .send({ roleName: 'everything', permissions: ['patient.*'] });

    expect(res).to.have.status(201);
  });
});

describe('hardening — deleting a role cleans up after itself', () => {
  let world;
  beforeEach(() => { world = buildWorld(); });

  const admin = () => authHeader(world.users.admin);

  it('force deletion revokes the assignments that pointed at the role', async () => {
    await chai
      .request(world.app)
      .post('/api/v1/access/roles')
      .set('Authorization', admin())
      .send({ roleName: 'auditor', permissions: ['access.audit:read'] });

    await chai
      .request(world.app)
      .post('/api/v1/access/role-assignments')
      .set('Authorization', admin())
      .send({ userId: world.ids.analyst, roleName: 'auditor', reason: 'Quarterly review' });

    const allowed = await chai.request(world.app).get('/api/v1/access/audit').set('Authorization', authHeader(world.users.analyst));
    expect(allowed).to.have.status(200);

    const deleted = await chai
      .request(world.app)
      .delete('/api/v1/access/roles/auditor?force=true')
      .set('Authorization', admin());

    expect(deleted).to.have.status(200);
    expect(deleted.body.revokedAssignments).to.equal(1);

    // No dangling assignment left behind, so the capability is genuinely gone.
    const after = await chai.request(world.app).get('/api/v1/access/audit').set('Authorization', authHeader(world.users.analyst));
    expect(after).to.have.status(403);

    const explained = await chai
      .request(world.app)
      .get(`/api/v1/access/users/${world.ids.analyst}/roles`)
      .set('Authorization', admin());

    expect(explained.body.effectiveRoles).to.deep.equal(['analyst']);
    expect(explained.body.warnings).to.deep.equal([]);
  });

  it('reports primary holders it could not clean up', async () => {
    await chai
      .request(world.app)
      .post('/api/v1/access/roles')
      .set('Authorization', admin())
      .send({ roleName: 'physio', permissions: ['patient:read'] });

    world.repository.addUser({ fullname: 'Physio Pat', email: 'pat@guardian.test', roleName: 'physio' });

    const deleted = await chai
      .request(world.app)
      .delete('/api/v1/access/roles/physio?force=true')
      .set('Authorization', admin());

    expect(deleted).to.have.status(200);
    expect(deleted.body.orphanedPrimaryHolders).to.equal(1);
  });
});

describe('hardening — audit completeness', () => {
  let world;
  beforeEach(() => { world = buildWorld(); });

  it('records successful use of a pure-RBAC route, not only denials', async () => {
    await chai.request(world.app).get('/api/v1/access/grants').set('Authorization', authHeader(world.users.drHouse));

    const audit = await chai.request(world.app).get('/api/v1/access/audit').set('Authorization', authHeader(world.users.admin));
    const allows = audit.body.entries.filter((entry) => entry.reason === 'ALLOW_ROLE_CAPABILITY');

    expect(allows.length).to.be.above(0);
    expect(allows.some((entry) => entry.permission === 'access.grant:manage')).to.equal(true);
  });

  it('still records the denial side', async () => {
    await chai.request(world.app).get('/api/v1/access/grants').set('Authorization', authHeader(world.users.nurseJoy));

    const audit = await chai.request(world.app).get('/api/v1/access/audit').set('Authorization', authHeader(world.users.admin));
    const denials = audit.body.entries.filter((entry) => entry.reason === 'DENY_ROLE_LACKS_CAPABILITY');

    expect(denials.length).to.be.above(0);
  });

  it('names every role a multi-role user holds on the audit row', async () => {
    await chai
      .request(world.app)
      .post('/api/v1/access/roles')
      .set('Authorization', authHeader(world.users.admin))
      .send({ roleName: 'auditor', permissions: ['access.audit:read'] });

    await chai
      .request(world.app)
      .post('/api/v1/access/role-assignments')
      .set('Authorization', authHeader(world.users.admin))
      .send({ userId: world.ids.analyst, roleName: 'auditor', reason: 'Review' });

    await chai.request(world.app).get(RECORD(world.ids.alice)).set('Authorization', authHeader(world.users.analyst));

    const audit = await chai.request(world.app).get('/api/v1/access/audit').set('Authorization', authHeader(world.users.admin));
    const row = audit.body.entries.find(
      (entry) => entry.event === 'access.decision' && String(entry.subject) === world.ids.analyst && entry.patient
    );

    expect(row.subjectRole).to.equal('analyst,auditor');
  });
});

describe('hardening — malformed ids never reach the query layer', () => {
  /**
   * These exercise the MONGO repository directly, with no database connection.
   * The guards short-circuit before mongoose is called, which is the whole
   * point: an unvalidated id reaching find() raises a CastError and surfaces
   * as a 500 instead of a 403.
   *
   * The in-memory repository cannot catch this class of bug — its ids are
   * opaque strings and it never casts — so the API suites passed while the
   * mongo path was broken. Matching method names is not the same as matching
   * behaviour.
   */
  const { createMongoRepository } = require('../access/accessRepository.mongo');

  let repository;
  before(() => { repository = createMongoRepository(); });

  it('getGrants returns nothing for a malformed patient id', async () => {
    const grants = await repository.getGrants({ subjectId: '66f1a2b3c4d5e6f708192a3b', patientId: 'not-an-object-id' });
    expect(grants).to.deep.equal([]);
  });

  it('getGrants returns nothing for a malformed subject id', async () => {
    const grants = await repository.getGrants({ subjectId: 'nope', patientId: '66f1a2b3c4d5e6f708192a3b' });
    expect(grants).to.deep.equal([]);
  });

  it('getPatient returns null for a malformed id', async () => {
    expect(await repository.getPatient('not-an-object-id')).to.equal(null);
  });

  it('listGrants returns an empty page for a malformed filter id', async () => {
    const result = await repository.listGrants({ patient: 'not-an-object-id' });
    expect(result.total).to.equal(0);
    expect(result.grants).to.deep.equal([]);
  });

  it('listAudit returns an empty page for a malformed filter id', async () => {
    const result = await repository.listAudit({ subject: 'not-an-object-id' });
    expect(result.total).to.equal(0);
    expect(result.entries).to.deep.equal([]);
  });

  it('rejects a 12-character string that mongoose isValid() would accept', async () => {
    // 'not-an-obj-i' is 12 chars, so ObjectId.isValid() passes it and it
    // round-trips to something entirely different.
    expect(await repository.getPatient('not-an-obj-i')).to.equal(null);
  });
});
