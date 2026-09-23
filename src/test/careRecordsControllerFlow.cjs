process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'gmproject';

const chai = require('chai');
const chaiHttp = require('chai-http');
const mongoose = require('mongoose');

const createTestApp = require('./helpers/testApp.cjs');
const { connectTestDb, clearTestDb, disconnectTestDb } = require('./helpers/db.cjs');
const { seedRoles, createUser, createPatient, authHeader } = require('./helpers/fixtures.cjs');
const PatientLog = require('../models/PatientLog');

chai.use(chaiHttp);
const { expect } = chai;
const app = createTestApp();

describe('care records controller flow', function () {
  this.timeout(15000);

  before(connectTestDb);
  beforeEach(clearTestDb);
  after(disconnectTestDb);

  it('covers health-record invalid id, missing patient, access denied and invalid vitals branches', async () => {
    const roles = await seedRoles();
    const caretaker = await createUser({ fullname: 'Health Caretaker', email: 'health-caretaker@example.com', role: roles.caretaker });
    const otherCaretaker = await createUser({ fullname: 'Other Health Caretaker', email: 'other-health-caretaker@example.com', role: roles.caretaker });
    const nurse = await createUser({ fullname: 'Health Nurse', email: 'health-nurse@example.com', role: roles.nurse });
    const otherNurse = await createUser({ fullname: 'Other Health Nurse', email: 'other-health-nurse@example.com', role: roles.nurse });
    const patient = await createPatient({ fullname: 'Health Patient', caretaker, assignedNurses: [nurse] });

    const invalidId = await chai
      .request(app)
      .get('/api/v1/patient/not-valid/health-records')
      .set('Authorization', authHeader(nurse));
    expect(invalidId).to.have.status(400);

    const missingPatient = await chai
      .request(app)
      .get(`/api/v1/patient/${new mongoose.Types.ObjectId()}/health-records`)
      .set('Authorization', authHeader(nurse));
    expect(missingPatient).to.have.status(404);

    const denied = await chai
      .request(app)
      .get(`/api/v1/patient/${patient._id}/health-records`)
      .set('Authorization', authHeader(otherNurse));
    expect(denied).to.have.status(403);

    const invalidVitals = await chai
      .request(app)
      .post(`/api/v1/patient/${patient._id}/health-record`)
      .set('Authorization', authHeader(nurse))
      .send({ vitals: { bloodPressure: '120-80', temperature: 36.7, heartRate: 70, respiratoryRate: 14 } });
    expect(invalidVitals).to.have.status(400);

    const caretakerDenied = await chai
      .request(app)
      .post(`/api/v1/patient/${patient._id}/health-record`)
      .set('Authorization', authHeader(otherCaretaker))
      .send({ vitals: { bloodPressure: '120/80', temperature: 36.7, heartRate: 70, respiratoryRate: 14 } });
    expect(caretakerDenied).to.have.status(403);
  });

  it('covers health-record creation, read and report not-assigned/no-report/success branches', async () => {
    const roles = await seedRoles();
    const caretaker = await createUser({ fullname: 'Report Health Caretaker', email: 'report-health-caretaker@example.com', role: roles.caretaker });
    const nurse = await createUser({ fullname: 'Report Health Nurse', email: 'report-health-nurse@example.com', role: roles.nurse });
    const otherNurse = await createUser({ fullname: 'Report Other Nurse', email: 'report-other-nurse@example.com', role: roles.nurse });
    const patient = await createPatient({ fullname: 'Report Health Patient', caretaker, assignedNurses: [nurse] });
    const emptyPatient = await createPatient({ fullname: 'Empty Health Patient', caretaker, assignedNurses: [nurse] });

    const noReport = await chai
      .request(app)
      .get(`/api/v1/patient/${emptyPatient._id}/report`)
      .set('Authorization', authHeader(nurse));
    expect(noReport).to.have.status(404);

    const notAssignedReport = await chai
      .request(app)
      .get(`/api/v1/patient/${patient._id}/report`)
      .set('Authorization', authHeader(otherNurse));
    expect(notAssignedReport).to.have.status(403);

    const created = await chai
      .request(app)
      .post(`/api/v1/patient/${patient._id}/health-record`)
      .set('Authorization', authHeader(nurse))
      .send({ vitals: { bloodPressure: '120/80', temperature: 36.7, heartRate: 70, respiratoryRate: 14 }, notes: 'stable' });
    expect(created).to.have.status(201);

    const records = await chai
      .request(app)
      .get(`/api/v1/patient/${patient._id}/health-records`)
      .set('Authorization', authHeader(caretaker));
    expect(records).to.have.status(200);

    const report = await chai
      .request(app)
      .get(`/api/v1/patient/${patient._id}/report`)
      .set('Authorization', authHeader(nurse));
    expect(report).to.have.status(200);
  });

  it('covers prescription validation and not-found branches', async () => {
    const roles = await seedRoles();
    const admin = await createUser({ fullname: 'Prescription Admin', email: 'prescription-admin@example.com', role: roles.admin });
    const doctor = await createUser({ fullname: 'Prescription Doctor', email: 'prescription-doctor@example.com', role: roles.doctor });
    const caretaker = await createUser({ fullname: 'Prescription Caretaker', email: 'prescription-caretaker@example.com', role: roles.caretaker });
    const patient = await createPatient({ fullname: 'Prescription Patient', caretaker, assignedDoctor: doctor });

    const noItems = await chai
      .request(app)
      .post('/api/v1/prescriptions')
      .set('Authorization', authHeader(doctor))
      .send({ patientId: patient._id, items: [] });
    expect(noItems).to.have.status(400);

    const badItem = await chai
      .request(app)
      .post('/api/v1/prescriptions')
      .set('Authorization', authHeader(doctor))
      .send({ patientId: patient._id, items: [{ name: 'Med' }] });
    expect(badItem).to.have.status(400);

    const missingPatient = await chai
      .request(app)
      .post('/api/v1/prescriptions')
      .set('Authorization', authHeader(doctor))
      .send({ patientId: new mongoose.Types.ObjectId(), items: [{ name: 'Med', dose: '1', frequency: 'daily', durationDays: 3 }] });
    expect(missingPatient).to.have.status(404);

    const byName = await chai
      .request(app)
      .post('/api/v1/prescriptions')
      .set('Authorization', authHeader(admin))
      .send({ patientName: patient.fullname, items: [{ name: 'Med', dose: '1', frequency: 'daily', durationDays: 3 }] });
    expect(byName).to.have.status(201);

    const missingId = new mongoose.Types.ObjectId();
    const readMissing = await chai.request(app).get(`/api/v1/prescriptions/${missingId}`).set('Authorization', authHeader(admin));
    expect(readMissing).to.have.status(404);
    const updateMissing = await chai.request(app).patch(`/api/v1/prescriptions/${missingId}`).set('Authorization', authHeader(admin)).send({ notes: 'missing' });
    expect(updateMissing).to.have.status(404);
    const discontinueMissing = await chai.request(app).post(`/api/v1/prescriptions/${missingId}/discontinue`).set('Authorization', authHeader(admin));
    expect(discontinueMissing).to.have.status(404);
    const deleteMissing = await chai.request(app).delete(`/api/v1/prescriptions/${missingId}`).set('Authorization', authHeader(admin));
    expect(deleteMissing).to.have.status(404);

    const invalidPatientList = await chai
      .request(app)
      .get('/api/v1/patients/not-valid/prescriptions')
      .set('Authorization', authHeader(admin));
    expect(invalidPatientList).to.have.status(400);

    const list = await chai
      .request(app)
      .get(`/api/v1/patients/${patient._id}/prescriptions?status=active&page=1&limit=5`)
      .set('Authorization', authHeader(admin));
    expect(list).to.have.status(200);
  });

  it('covers patient log validation, forbidden delete and missing delete branches', async () => {
    const roles = await seedRoles();
    const nurse = await createUser({ fullname: 'Log Nurse', email: 'log-nurse@example.com', role: roles.nurse });
    const otherNurse = await createUser({ fullname: 'Other Log Nurse', email: 'other-log-nurse@example.com', role: roles.nurse });
    const caretaker = await createUser({ fullname: 'Log Caretaker', email: 'log-caretaker@example.com', role: roles.caretaker });
    const patient = await createPatient({ fullname: 'Log Patient', caretaker, assignedNurses: [nurse] });

    const invalidCreate = await chai
      .request(app)
      .post('/api/v1/patient-logs')
      .set('Authorization', authHeader(nurse))
      .send({ title: 'Missing fields' });
    expect(invalidCreate).to.have.status(400);

    const log = await PatientLog.create({ title: 'Private Log', description: 'Only creator deletes', patient: patient._id, createdBy: nurse._id });

    const forbiddenDelete = await chai
      .request(app)
      .delete(`/api/v1/patient-logs/${log._id}`)
      .set('Authorization', authHeader(otherNurse));
    expect(forbiddenDelete).to.have.status(403);

    const missingDelete = await chai
      .request(app)
      .delete(`/api/v1/patient-logs/${new mongoose.Types.ObjectId()}`)
      .set('Authorization', authHeader(nurse));
    expect(missingDelete).to.have.status(404);
  });
});
