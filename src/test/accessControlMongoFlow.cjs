/**
 * Guardian — access-control integration test against the real mongoose models.
 *
 * The API test (accessControlApiFlow.cjs) proves the behaviour with the
 * in-memory repository. This one proves the *mongo repository* implements the
 * same contract: real documents, real indexes, real populate.
 *
 * It uses the Guardian test DB helper. If no MongoDB is reachable the whole
 * suite skips rather than fails, so it never blocks a machine without a
 * database.
 *
 * Run:  npx mocha src/test/accessControlMongoFlow.cjs --exit
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
const express = require('express');

const { connectTestDb, clearTestDb, disconnectTestDb } = require('./helpers/db.cjs');
const { seedRoles, createUser, createPatient, authHeader } = require('./helpers/fixtures.cjs');

chai.use(chaiHttp);
const { expect } = chai;

const RECORD = (patientId) => `/api/v1/access/demo/patients/${patientId}/record`;

function buildApp(serviceOptions) {
  const { createMongoRepository } = require('../access/accessRepository.mongo');
  const { createAccessControlService } = require('../access/accessControlService');

  const app = express();
  app.use(express.json());
  app.locals.accessControl = createAccessControlService({
    repository: createMongoRepository(),
    options: Object.assign({ allowRelationshipAccess: false, maskUnknownPatient: true }, serviceOptions)
  });
  app.use('/api/v1/access', require('../routes/accessControlRoutes'));
  return app;
}

describe('access control — mongo repository integration', function () {
  this.timeout(20000);

  let app;
  let admin;
  let doctor;
  let nurse;
  let analyst;
  let caretaker;
  let alice;
  let bob;

  before(async function () {
    try {
      await connectTestDb();
    } catch (error) {
      console.warn('  (skipping: no MongoDB reachable — ' + error.message + ')');
      this.skip();
    }
    app = buildApp();
  });

  after(async () => {
    await disconnectTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
    const roles = await seedRoles(['admin', 'doctor', 'nurse', 'caretaker', 'analyst']);

    admin = await createUser({ fullname: 'Admin', email: 'admin@ac.test', role: roles.admin, approvalStatus: 'approved' });
    doctor = await createUser({ fullname: 'Dr House', email: 'house@ac.test', role: roles.doctor, approvalStatus: 'approved' });
    nurse = await createUser({ fullname: 'Nurse Joy', email: 'joy@ac.test', role: roles.nurse, approvalStatus: 'approved' });
    analyst = await createUser({ fullname: 'Analyst', email: 'analyst@ac.test', role: roles.analyst, approvalStatus: 'approved' });
    caretaker = await createUser({ fullname: 'Caretaker', email: 'care@ac.test', role: roles.caretaker, approvalStatus: 'approved' });

    alice = await createPatient({ fullname: 'Alice', caretaker, assignedNurses: [nurse], assignedDoctor: doctor });
    bob = await createPatient({ fullname: 'Bob', caretaker, assignedDoctor: doctor });

    // Seed the role matrix into mongo so the documented defaults are exercised
    // through RolePermissionSet rather than the compiled-in fallback.
    const { seedMatrix } = require('../seedAccessControl');
    await seedMatrix();
  });

  it('denies an analyst with no grant, and records the denial', async () => {
    const res = await chai.request(app).get(RECORD(alice._id)).set('Authorization', authHeader(analyst));
    expect(res).to.have.status(403);
    expect(res.body.reason).to.equal('DENY_NO_GRANT');

    const AccessAuditLog = require('../models/AccessAuditLog');
    const entries = await AccessAuditLog.find({ subject: analyst._id, allowed: false }).lean();
    expect(entries).to.have.length.greaterThan(0);
  });

  it('a doctor grants access and the analyst reaches exactly that patient', async () => {
    const issued = await chai
      .request(app)
      .post('/api/v1/access/grants')
      .set('Authorization', authHeader(doctor))
      .send({
        subjectId: String(analyst._id),
        patientId: String(alice._id),
        permissions: ['patient:read'],
        reason: 'Falls analysis for the September safety report'
      });

    expect(issued).to.have.status(201);

    const allowed = await chai.request(app).get(RECORD(alice._id)).set('Authorization', authHeader(analyst));
    expect(allowed).to.have.status(200);

    const denied = await chai.request(app).get(RECORD(bob._id)).set('Authorization', authHeader(analyst));
    expect(denied).to.have.status(403);
  });

  it('persists the grant as a real document with its provenance intact', async () => {
    await chai
      .request(app)
      .post('/api/v1/access/grants')
      .set('Authorization', authHeader(doctor))
      .send({
        subjectId: String(analyst._id),
        patientId: String(alice._id),
        permissions: ['patient:read'],
        reason: 'Ward round cover',
        purpose: 'direct-care'
      });

    const PatientAccessGrant = require('../models/PatientAccessGrant');
    const grant = await PatientAccessGrant.findOne({ subject: analyst._id, patient: alice._id });

    expect(String(grant.grantedBy)).to.equal(String(doctor._id));
    expect(grant.grantedByRole).to.equal('doctor');
    expect(grant.reason).to.equal('Ward round cover');
    expect(grant.effectiveStatus).to.equal('active');
  });

  it('revocation is soft and keeps the history', async () => {
    const issued = await chai
      .request(app)
      .post('/api/v1/access/grants')
      .set('Authorization', authHeader(doctor))
      .send({ subjectId: String(analyst._id), patientId: String(alice._id), permissions: ['patient:read'], reason: 'Temporary' });

    await chai
      .request(app)
      .delete(`/api/v1/access/grants/${issued.body.grant.id}`)
      .set('Authorization', authHeader(doctor))
      .send({ reason: 'Finished' });

    const PatientAccessGrant = require('../models/PatientAccessGrant');
    const grant = await PatientAccessGrant.findById(issued.body.grant.id);

    expect(grant).to.not.equal(null);
    expect(grant.status).to.equal('revoked');
    expect(String(grant.revokedBy)).to.equal(String(doctor._id));
    expect(grant.revocationReason).to.equal('Finished');

    const after = await chai.request(app).get(RECORD(alice._id)).set('Authorization', authHeader(analyst));
    expect(after).to.have.status(403);
  });

  it('rejects a malformed patient id without touching the database', async () => {
    const res = await chai.request(app).get(RECORD('not-an-object-id')).set('Authorization', authHeader(analyst));
    expect(res).to.have.status(403);
    expect(res.body.reason).to.equal('DENY_PATIENT_UNKNOWN');
  });

  it('an admin sees every patient through the scoped list endpoint', async () => {
    const res = await chai.request(app).get('/api/v1/access/me/patients').set('Authorization', authHeader(admin));
    expect(res).to.have.status(200);
    expect(res.body.patients.map((p) => p.id)).to.have.members([String(alice._id), String(bob._id)]);
  });
});
