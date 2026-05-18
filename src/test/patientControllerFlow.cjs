process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'gmproject';

const chai = require('chai');
const chaiHttp = require('chai-http');
const mongoose = require('mongoose');

const createTestApp = require('./helpers/testApp.cjs');
const { connectTestDb, clearTestDb, disconnectTestDb } = require('./helpers/db.cjs');
const { seedRoles, createUser, createPatient, authHeader } = require('./helpers/fixtures.cjs');
const Patient = require('../models/Patient');
const EntryReport = require('../models/EntryReport');

chai.use(chaiHttp);
const { expect } = chai;
const app = createTestApp();

describe('patient controller flow', function () {
  this.timeout(15000);

  before(connectTestDb);
  beforeEach(clearTestDb);
  after(disconnectTestDb);

  it('covers patient list filters and patient detail 400/404/success paths', async () => {
    const roles = await seedRoles();
    const admin = await createUser({ fullname: 'List Admin', email: 'list-admin@example.com', role: roles.admin });
    const caretaker = await createUser({ fullname: 'List Caretaker', email: 'list-caretaker@example.com', role: roles.caretaker });
    await createPatient({ fullname: 'Alice Filter', gender: 'F', caretaker });
    await createPatient({ fullname: 'Bob Filter', gender: 'M', caretaker, isDeleted: true });

    const list = await chai
      .request(app)
      .get('/api/v1/patients?search=Filter&includeDeleted=true&sort=fullname&page=1&limit=10')
      .set('Authorization', authHeader(admin));
    expect(list).to.have.status(200);
    expect(list.body.total).to.equal(2);

    const invalid = await chai
      .request(app)
      .get('/api/v1/patients/not-a-valid-object-id')
      .set('Authorization', authHeader(admin));
    expect(invalid).to.have.status(400);

    const missing = await chai
      .request(app)
      .get(`/api/v1/patients/${new mongoose.Types.ObjectId()}`)
      .set('Authorization', authHeader(admin));
    expect(missing).to.have.status(404);

    const patientId = list.body.patients[0]._id;
    const details = await chai
      .request(app)
      .get(`/api/v1/patients/${patientId}`)
      .set('Authorization', authHeader(admin));
    expect(details).to.have.status(200);
    expect(details.body.age).to.be.a('number');
  });

  it('covers patient update/delete authorization and soft-delete branches', async () => {
    const roles = await seedRoles();
    const owner = await createUser({ fullname: 'Owner Caretaker', email: 'owner@example.com', role: roles.caretaker });
    const other = await createUser({ fullname: 'Other Caretaker', email: 'other@example.com', role: roles.caretaker });
    const nurse = await createUser({ fullname: 'Unassigned Nurse', email: 'unassigned@example.com', role: roles.nurse });
    const patient = await createPatient({ fullname: 'Delete Me', caretaker: owner });

    const forbiddenUpdate = await chai
      .request(app)
      .put(`/api/v1/patients/${patient._id}`)
      .set('Authorization', authHeader(other))
      .send({ notes: 'not allowed' });
    expect(forbiddenUpdate).to.have.status(403);

    const forbiddenNurseUpdate = await chai
      .request(app)
      .put(`/api/v1/patients/${patient._id}`)
      .set('Authorization', authHeader(nurse))
      .send({ notes: 'not assigned' });
    expect(forbiddenNurseUpdate).to.have.status(403);

    const successUpdate = await chai
      .request(app)
      .put(`/api/v1/patients/${patient._id}`)
      .set('Authorization', authHeader(owner))
      .send({
        fullname: 'Delete Me Updated',
        gender: 'F',
        dateOfBirth: '1991-02-03',
        description: 'updated',
        image: 'manual-image.png',
        emergencyContactName: 'Contact',
        emergencyContactNumber: '0400000000',
        nextOfKinName: 'Kin',
        nextOfKinRelationship: 'FRIEND',
        medicalSummary: 'summary',
        allergies: 'Dust, Pollen',
        conditions: ['Asthma'],
        notes: 'full update path',
        dateOfAdmitting: '2026-05-01',
      });
    expect(successUpdate).to.have.status(200);
    expect(successUpdate.body.patient.fullname).to.equal('Delete Me Updated');

    const forbiddenDelete = await chai
      .request(app)
      .delete(`/api/v1/patients/${patient._id}`)
      .set('Authorization', authHeader(other));
    expect(forbiddenDelete).to.have.status(403);

    const successDelete = await chai
      .request(app)
      .delete(`/api/v1/patients/${patient._id}`)
      .set('Authorization', authHeader(owner));
    expect(successDelete).to.have.status(200);

    const missingDelete = await chai
      .request(app)
      .delete(`/api/v1/patients/${patient._id}`)
      .set('Authorization', authHeader(owner));
    expect(missingDelete).to.have.status(404);
  });

  it('covers nurse assignment success and validation branches', async () => {
    const roles = await seedRoles();
    const caretaker = await createUser({ fullname: 'Assign Caretaker', email: 'assign-caretaker@example.com', role: roles.caretaker });
    const nurse = await createUser({ fullname: 'Assignable Nurse', email: 'assign-nurse@example.com', role: roles.nurse });
    const doctor = await createUser({ fullname: 'Not Nurse', email: 'not-nurse@example.com', role: roles.doctor });
    const patient = await createPatient({ fullname: 'Assign Patient', caretaker });

    const invalid = await chai
      .request(app)
      .post('/api/v1/patients/assign-nurse')
      .set('Authorization', authHeader(caretaker))
      .send({ nurseId: nurse._id, patientId: new mongoose.Types.ObjectId() });
    expect(invalid).to.have.status(404);

    const wrongRole = await chai
      .request(app)
      .post('/api/v1/patients/assign-nurse')
      .set('Authorization', authHeader(caretaker))
      .send({ nurseId: doctor._id, patientId: patient._id });
    expect(wrongRole).to.have.status(400);

    const assigned = await chai
      .request(app)
      .post('/api/v1/patients/assign-nurse')
      .set('Authorization', authHeader(caretaker))
      .send({ nurseId: nurse._id, patientId: patient._id });
    expect(assigned).to.have.status(200);

    const assignedAgain = await chai
      .request(app)
      .post('/api/v1/patients/assign-nurse')
      .set('Authorization', authHeader(caretaker))
      .send({ nurseId: nurse._id, patientId: patient._id });
    expect(assignedAgain).to.have.status(200);
  });

  it('covers assigned-patient role guard and entry activity branches', async () => {
    const roles = await seedRoles();
    const caretaker = await createUser({ fullname: 'Activity Caretaker', email: 'activity-caretaker@example.com', role: roles.caretaker });
    const nurse = await createUser({ fullname: 'Activity Nurse', email: 'activity-nurse@example.com', role: roles.nurse });
    const doctor = await createUser({ fullname: 'Activity Doctor', email: 'activity-doctor@example.com', role: roles.doctor });
    const patient = await createPatient({ fullname: 'Activity Patient', caretaker, assignedNurses: [nurse] });

    const unauthorizedAssigned = await chai
      .request(app)
      .get('/api/v1/patients/assigned-patients')
      .set('Authorization', authHeader(doctor));
    expect(unauthorizedAssigned).to.have.status(403);

    const missingPatientActivities = await chai
      .request(app)
      .get('/api/v1/patients/activities')
      .set('Authorization', authHeader(nurse));
    expect(missingPatientActivities).to.have.status(400);

    const entry = await chai
      .request(app)
      .post('/api/v1/patients/entryreport')
      .set('Authorization', authHeader(nurse))
      .send({ patientId: patient._id, activityType: 'walking', comment: 'stable' });
    expect(entry).to.have.status(201);

    const activities = await chai
      .request(app)
      .get(`/api/v1/patients/activities?patientId=${patient._id}`)
      .set('Authorization', authHeader(nurse));
    expect(activities).to.have.status(200);
    expect(activities.body).to.have.length(1);

    const missingDelete = await chai
      .request(app)
      .delete(`/api/v1/patients/entryreport/${new mongoose.Types.ObjectId()}`)
      .set('Authorization', authHeader(nurse));
    expect(missingDelete).to.have.status(404);

    const saved = await EntryReport.findOne({ patient: patient._id });
    const deleted = await chai
      .request(app)
      .delete(`/api/v1/patients/entryreport/${saved._id}`)
      .set('Authorization', authHeader(nurse));
    expect(deleted).to.have.status(200);
  });
});
