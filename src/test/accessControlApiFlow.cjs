/**
 * Guardian — access-control API tests.
 *
 * Proves the whole mechanism through real HTTP against the real routes,
 * middleware and controllers. Runs with no MongoDB (the in-memory repository
 * implements the same interface the mongo one does), so it works on any
 * machine and in CI without a database service.
 *
 * Run:  npx mocha src/test/accessControlApiFlow.cjs --exit
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
const SCRIPTS = (patientId) => `/api/v1/access/demo/patients/${patientId}/prescriptions`;

describe('access control API — authentication gate', () => {
  let world;
  beforeEach(() => { world = buildWorld(); });

  it('rejects a request with no token', async () => {
    const res = await chai.request(world.app).get(RECORD(world.ids.alice));
    expect(res).to.have.status(401);
  });

  it('rejects a malformed Authorization header', async () => {
    const res = await chai.request(world.app).get(RECORD(world.ids.alice)).set('Authorization', 'Token abc');
    expect(res).to.have.status(401);
  });

  it('rejects a token signed with the wrong secret', async () => {
    const jwt = require('jsonwebtoken');
    const forged = jwt.sign({ _id: world.ids.analyst }, 'not-the-secret', { algorithm: 'HS256' });
    const res = await chai.request(world.app).get(RECORD(world.ids.alice)).set('Authorization', `Bearer ${forged}`);
    expect(res).to.have.status(400);
  });
});

describe('access control API — a capable user with no authorisation sees nothing', () => {
  let world;
  beforeEach(() => { world = buildWorld(); });

  it('DENIES the analyst, who holds patient:read but has no grant', async () => {
    const res = await chai
      .request(world.app)
      .get(RECORD(world.ids.alice))
      .set('Authorization', authHeader(world.users.analyst));

    expect(res).to.have.status(403);
    expect(res.body.reason).to.equal('DENY_NO_GRANT');
  });

  it('reports an empty authorised patient list for that analyst', async () => {
    const res = await chai
      .request(world.app)
      .get('/api/v1/access/me/patients')
      .set('Authorization', authHeader(world.users.analyst));

    expect(res).to.have.status(200);
    expect(res.body.patients).to.have.length(0);
  });

  it('returns the same 403 for a patient that does not exist, so ids cannot be probed', async () => {
    const real = await chai.request(world.app).get(RECORD(world.ids.alice)).set('Authorization', authHeader(world.users.analyst));
    const fake = await chai.request(world.app).get(RECORD('ffffffffffffffffffffffff')).set('Authorization', authHeader(world.users.analyst));

    expect(real.status).to.equal(403);
    expect(fake.status).to.equal(403);
    expect(fake.body.message).to.equal(real.body.message);
  });
});

describe('access control API — a doctor authorises one patient', () => {
  let world;
  beforeEach(() => { world = buildWorld(); });

  async function grantAliceToAnalyst(actor, permissions = ['patient:read']) {
    return chai
      .request(world.app)
      .post('/api/v1/access/grants')
      .set('Authorization', authHeader(actor))
      .send({
        subjectId: world.ids.analyst,
        patientId: world.ids.alice,
        permissions,
        reason: 'Reviewing falls data for the September safety report'
      });
  }

  it('the analyst can read exactly that patient once the grant exists', async () => {
    const granted = await grantAliceToAnalyst(world.users.drHouse);
    expect(granted).to.have.status(201);

    const allowed = await chai.request(world.app).get(RECORD(world.ids.alice)).set('Authorization', authHeader(world.users.analyst));
    expect(allowed).to.have.status(200);
    expect(allowed.body.authorisedBy).to.equal('ALLOW_EXPLICIT_GRANT');
  });

  it('and still cannot read any OTHER patient', async () => {
    await grantAliceToAnalyst(world.users.drHouse);

    const denied = await chai.request(world.app).get(RECORD(world.ids.bob)).set('Authorization', authHeader(world.users.analyst));
    expect(denied).to.have.status(403);
    expect(denied.body.reason).to.equal('DENY_NO_GRANT');
  });

  it('scopes the list endpoint to the single authorised patient', async () => {
    await grantAliceToAnalyst(world.users.drHouse);

    const res = await chai.request(world.app).get('/api/v1/access/me/patients').set('Authorization', authHeader(world.users.analyst));
    expect(res.body.patients.map((p) => p.id)).to.deep.equal([world.ids.alice]);
  });

  it('a grant of patient:read does not open prescriptions', async () => {
    await grantAliceToAnalyst(world.users.drHouse, ['patient:read']);

    const res = await chai.request(world.app).get(SCRIPTS(world.ids.alice)).set('Authorization', authHeader(world.users.analyst));
    expect(res).to.have.status(403);
    // The analyst role never carries patient.prescription:read, so the
    // capability layer stops it before scope is even consulted.
    expect(res.body.reason).to.equal('DENY_ROLE_LACKS_CAPABILITY');
  });

  it('intersects the requested permissions with the recipient role ceiling', async () => {
    const res = await grantAliceToAnalyst(world.users.drHouse, ['patient:read', 'patient.prescription:write']);

    expect(res).to.have.status(201);
    expect(res.body.grant.permissions).to.deep.equal(['patient:read']);
    expect(res.body.droppedByRoleCeiling).to.deep.equal(['patient.prescription:write']);
  });

  it('refuses a grant with no reason', async () => {
    const res = await chai
      .request(world.app)
      .post('/api/v1/access/grants')
      .set('Authorization', authHeader(world.users.drHouse))
      .send({ subjectId: world.ids.analyst, patientId: world.ids.alice, permissions: ['patient:read'] });

    expect(res).to.have.status(400);
    expect(res.body.code).to.equal('REASON_REQUIRED');
  });

  it('refuses an unknown permission code', async () => {
    const res = await chai
      .request(world.app)
      .post('/api/v1/access/grants')
      .set('Authorization', authHeader(world.users.drHouse))
      .send({ subjectId: world.ids.analyst, patientId: world.ids.alice, permissions: ['patient:destroy'], reason: 'testing' });

    expect(res).to.have.status(400);
    expect(res.body.code).to.equal('UNKNOWN_PERMISSION');
  });
});

describe('access control API — who may authorise', () => {
  let world;
  beforeEach(() => { world = buildWorld(); });

  it('a nurse may not issue grants', async () => {
    const res = await chai
      .request(world.app)
      .post('/api/v1/access/grants')
      .set('Authorization', authHeader(world.users.nurseJoy))
      .send({ subjectId: world.ids.analyst, patientId: world.ids.alice, permissions: ['patient:read'], reason: 'covering' });

    expect(res).to.have.status(403);
    expect(res.body.reason).to.equal('DENY_ROLE_LACKS_CAPABILITY');
  });

  it('a doctor may not authorise access to a patient who is not theirs', async () => {
    const res = await chai
      .request(world.app)
      .post('/api/v1/access/grants')
      .set('Authorization', authHeader(world.users.drHouse)) // House is on Alice, not Bob
      .send({ subjectId: world.ids.analyst, patientId: world.ids.bob, permissions: ['patient:read'], reason: 'curiosity' });

    expect(res).to.have.status(403);
    expect(res.body.code).to.equal('GRANTOR_NOT_RESPONSIBLE');
  });

  it('an administrator may authorise access to any patient', async () => {
    const res = await chai
      .request(world.app)
      .post('/api/v1/access/grants')
      .set('Authorization', authHeader(world.users.admin))
      .send({ subjectId: world.ids.analyst, patientId: world.ids.bob, permissions: ['patient:read'], reason: 'Data quality audit' });

    expect(res).to.have.status(201);
  });

  it('a nurse cannot read the grant register at all', async () => {
    const res = await chai.request(world.app).get('/api/v1/access/grants').set('Authorization', authHeader(world.users.nurseJoy));
    expect(res).to.have.status(403);
  });
});

describe('access control API — revocation', () => {
  let world;
  beforeEach(() => { world = buildWorld(); });

  it('access stops the moment the grant is revoked', async () => {
    const issued = await chai
      .request(world.app)
      .post('/api/v1/access/grants')
      .set('Authorization', authHeader(world.users.drHouse))
      .send({ subjectId: world.ids.analyst, patientId: world.ids.alice, permissions: ['patient:read'], reason: 'Temporary cover' });

    const before = await chai.request(world.app).get(RECORD(world.ids.alice)).set('Authorization', authHeader(world.users.analyst));
    expect(before).to.have.status(200);

    const revoked = await chai
      .request(world.app)
      .delete(`/api/v1/access/grants/${issued.body.grant.id}`)
      .set('Authorization', authHeader(world.users.drHouse))
      .send({ reason: 'Cover period ended' });
    expect(revoked).to.have.status(200);

    const after = await chai.request(world.app).get(RECORD(world.ids.alice)).set('Authorization', authHeader(world.users.analyst));
    expect(after).to.have.status(403);
    expect(after.body.reason).to.equal('DENY_GRANT_REVOKED');
  });

  it('an expired grant stops working without anyone touching it', async () => {
    await world.repository.createGrant({
      subject: world.ids.analyst,
      patient: world.ids.alice,
      permissions: ['patient:read'],
      grantedBy: world.ids.drHouse,
      reason: 'Expired cover',
      validFrom: new Date(Date.now() - 7200000),
      validUntil: new Date(Date.now() - 3600000)
    });

    const res = await chai.request(world.app).get(RECORD(world.ids.alice)).set('Authorization', authHeader(world.users.analyst));
    expect(res).to.have.status(403);
    expect(res.body.reason).to.equal('DENY_GRANT_EXPIRED');
  });
});

describe('access control API — break glass', () => {
  let world;
  beforeEach(() => { world = buildWorld(); });

  it('a nurse can take emergency access, time-boxed and recorded', async () => {
    const denied = await chai.request(world.app).get(RECORD(world.ids.bob)).set('Authorization', authHeader(world.users.nurseJoy));
    expect(denied).to.have.status(403);

    const broken = await chai
      .request(world.app)
      .post('/api/v1/access/break-glass')
      .set('Authorization', authHeader(world.users.nurseJoy))
      .send({ patientId: world.ids.bob, reason: 'Resident unresponsive, on-call doctor unreachable', minutes: 30 });

    expect(broken).to.have.status(201);
    expect(new Date(broken.body.expiresAt)).to.be.above(new Date());

    const allowed = await chai.request(world.app).get(RECORD(world.ids.bob)).set('Authorization', authHeader(world.users.nurseJoy));
    expect(allowed).to.have.status(200);
    expect(allowed.body.authorisedBy).to.equal('ALLOW_BREAK_GLASS');
  });

  it('refuses break glass without a written justification', async () => {
    const res = await chai
      .request(world.app)
      .post('/api/v1/access/break-glass')
      .set('Authorization', authHeader(world.users.nurseJoy))
      .send({ patientId: world.ids.bob, reason: 'urgent' });

    expect(res).to.have.status(400);
    expect(res.body.code).to.equal('REASON_REQUIRED');
  });

  it('caps the window at the configured maximum', async () => {
    const res = await chai
      .request(world.app)
      .post('/api/v1/access/break-glass')
      .set('Authorization', authHeader(world.users.nurseJoy))
      .send({ patientId: world.ids.bob, reason: 'Resident unresponsive, doctor unreachable', minutes: 100000 });

    const windowMs = new Date(res.body.expiresAt) - Date.now();
    expect(windowMs).to.be.at.most(61 * 60 * 1000);
  });

  it('an analyst role may not break glass', async () => {
    const res = await chai
      .request(world.app)
      .post('/api/v1/access/break-glass')
      .set('Authorization', authHeader(world.users.analyst))
      .send({ patientId: world.ids.bob, reason: 'Need this for the report right now' });

    expect(res).to.have.status(403);
    expect(res.body.code).to.equal('BREAKGLASS_FORBIDDEN');
  });
});

describe('access control API — audit trail', () => {
  let world;
  beforeEach(() => { world = buildWorld(); });

  it('records the denial, the grant, and the subsequent allow', async () => {
    await chai.request(world.app).get(RECORD(world.ids.alice)).set('Authorization', authHeader(world.users.analyst));

    await chai
      .request(world.app)
      .post('/api/v1/access/grants')
      .set('Authorization', authHeader(world.users.drHouse))
      .send({ subjectId: world.ids.analyst, patientId: world.ids.alice, permissions: ['patient:read'], reason: 'Safety report' });

    await chai.request(world.app).get(RECORD(world.ids.alice)).set('Authorization', authHeader(world.users.analyst));

    const audit = await chai.request(world.app).get('/api/v1/access/audit').set('Authorization', authHeader(world.users.admin));
    expect(audit).to.have.status(200);

    const events = audit.body.entries.map((entry) => `${entry.event}:${entry.reason}`);
    expect(events).to.include('access.decision:DENY_NO_GRANT');
    expect(events).to.include('grant.issued:GRANT_ISSUED');
    expect(events).to.include('access.decision:ALLOW_EXPLICIT_GRANT');
  });

  it('is not readable by a role without access.audit:read', async () => {
    const res = await chai.request(world.app).get('/api/v1/access/audit').set('Authorization', authHeader(world.users.analyst));
    expect(res).to.have.status(403);
  });

  it('answers "who can see this patient"', async () => {
    await chai
      .request(world.app)
      .post('/api/v1/access/grants')
      .set('Authorization', authHeader(world.users.drHouse))
      .send({ subjectId: world.ids.analyst, patientId: world.ids.alice, permissions: ['patient:read'], reason: 'Safety report' });

    const res = await chai
      .request(world.app)
      .get(`/api/v1/access/patients/${world.ids.alice}/subjects`)
      .set('Authorization', authHeader(world.users.admin));

    expect(res).to.have.status(200);
    expect(res.body.grants.map((g) => g.subject)).to.include(world.ids.analyst);
  });
});

describe('access control API — simulator and matrix', () => {
  let world;
  beforeEach(() => { world = buildWorld(); });

  it('explains a denial without performing it', async () => {
    const res = await chai
      .request(world.app)
      .post('/api/v1/access/check')
      .set('Authorization', authHeader(world.users.admin))
      .send({ userId: world.ids.analyst, patientId: world.ids.alice, permission: 'patient:read' });

    expect(res).to.have.status(200);
    expect(res.body.allowed).to.equal(false);
    expect(res.body.reason).to.equal('DENY_NO_GRANT');
    expect(res.body.subject.roleName).to.equal('analyst');
  });

  it('changing the matrix changes the outcome immediately', async () => {
    // Give the analyst nothing at all, then re-check.
    const updated = await chai
      .request(world.app)
      .put('/api/v1/access/matrix/analyst')
      .set('Authorization', authHeader(world.users.admin))
      .send({ permissions: [], canGrant: false, unscoped: false });

    expect(updated).to.have.status(200);

    const res = await chai
      .request(world.app)
      .post('/api/v1/access/check')
      .set('Authorization', authHeader(world.users.admin))
      .send({ userId: world.ids.analyst, patientId: world.ids.alice, permission: 'patient:read' });

    expect(res.body.reason).to.equal('DENY_ROLE_LACKS_CAPABILITY');
  });

  it('a doctor may read the matrix but not edit it', async () => {
    const read = await chai.request(world.app).get('/api/v1/access/matrix').set('Authorization', authHeader(world.users.drHouse));
    expect(read).to.have.status(200);

    const write = await chai
      .request(world.app)
      .put('/api/v1/access/matrix/nurse')
      .set('Authorization', authHeader(world.users.drHouse))
      .send({ permissions: ['*'] });

    expect(write).to.have.status(403);
  });
});

describe('access control API — relaxed mode (care relationships honoured)', () => {
  let world;
  beforeEach(() => { world = buildWorld({ allowRelationshipAccess: true }); });

  it('the assigned nurse reaches her own patient with no explicit grant', async () => {
    const res = await chai.request(world.app).get(RECORD(world.ids.alice)).set('Authorization', authHeader(world.users.nurseJoy));
    expect(res).to.have.status(200);
    expect(res.body.authorisedBy).to.equal('ALLOW_RELATIONSHIP');
  });

  it('but still cannot reach a patient she is not assigned to', async () => {
    const res = await chai.request(world.app).get(RECORD(world.ids.bob)).set('Authorization', authHeader(world.users.nurseJoy));
    expect(res).to.have.status(403);
  });

  it('and the unrelated analyst is still denied', async () => {
    const res = await chai.request(world.app).get(RECORD(world.ids.alice)).set('Authorization', authHeader(world.users.outsider));
    expect(res).to.have.status(403);
  });
});
