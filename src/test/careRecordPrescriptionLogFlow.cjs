process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'gmproject';

const chai = require('chai');
const chaiHttp = require('chai-http');

const createTestApp = require('./helpers/testApp.cjs');
const { connectTestDb, clearTestDb, disconnectTestDb } = require('./helpers/db.cjs');
const { createDashboardFixture, authHeader } = require('./helpers/fixtures.cjs');
const Prescription = require('../models/Prescription');
const PatientLog = require('../models/PatientLog');

chai.use(chaiHttp);
const { expect } = chai;
const app = createTestApp();

describe('care record, prescription and patient log flow', function () {
  this.timeout(15000);

  before(connectTestDb);
  beforeEach(clearTestDb);
  after(disconnectTestDb);

  it('allows an assigned nurse to create and read patient health records', async () => {
    const fixture = await createDashboardFixture();

    const createRes = await chai
      .request(app)
      .post(`/api/v1/patient/${fixture.activePatient._id}/health-record`)
      .set('Authorization', authHeader(fixture.nurse))
      .send({
        vitals: {
          bloodPressure: '120/80',
          temperature: 36.8,
          heartRate: 78,
          respiratoryRate: 16,
        },
        notes: 'Stable vitals recorded from integration test.',
      });

    expect(createRes).to.have.status(201);
    expect(createRes.body.notes).to.equal('Stable vitals recorded from integration test.');
    expect(createRes.body.vitals.bloodPressure).to.equal('120/80');

    const listRes = await chai
      .request(app)
      .get(`/api/v1/patient/${fixture.activePatient._id}/health-records`)
      .set('Authorization', authHeader(fixture.nurse));

    expect(listRes).to.have.status(200);
    expect(listRes.body).to.have.length(1);

    const reportRes = await chai
      .request(app)
      .get(`/api/v1/patient/${fixture.activePatient._id}/report`)
      .set('Authorization', authHeader(fixture.nurse));

    expect(reportRes).to.have.status(200);
    expect(reportRes.body).to.have.length(1);
  });

  it('rejects health record creation when required vitals are missing', async () => {
    const fixture = await createDashboardFixture();

    const res = await chai
      .request(app)
      .post(`/api/v1/patient/${fixture.activePatient._id}/health-record`)
      .set('Authorization', authHeader(fixture.nurse))
      .send({
        vitals: {
          bloodPressure: '120/80',
          temperature: 36.8,
        },
      });

    expect(res).to.have.status(400);
    expect(res.body.error).to.contain('Missing required vitals fields');
  });

  it('creates, reads, updates, discontinues and deletes prescriptions', async () => {
    const fixture = await createDashboardFixture();

    const createRes = await chai
      .request(app)
      .post('/api/v1/prescriptions')
      .set('Authorization', authHeader(fixture.doctor))
      .send({
        patientId: String(fixture.activePatient._id),
        items: [
          {
            name: 'Amoxicillin',
            dose: '500 mg',
            frequency: 'twice daily',
            durationDays: 7,
            quantity: 14,
            instructions: 'Take after food',
          },
        ],
        notes: 'Created during integration test.',
      });

    expect(createRes).to.have.status(201);
    expect(createRes.body.status).to.equal('active');
    expect(createRes.body.items[0].name).to.equal('Amoxicillin');
    const prescriptionId = createRes.body._id;

    const listByPatientRes = await chai
      .request(app)
      .get(`/api/v1/patients/${fixture.activePatient._id}/prescriptions`)
      .set('Authorization', authHeader(fixture.nurse));

    expect(listByPatientRes).to.have.status(200);
    expect(listByPatientRes.body.pagination.total).to.equal(1);

    const getRes = await chai
      .request(app)
      .get(`/api/v1/prescriptions/${prescriptionId}`)
      .set('Authorization', authHeader(fixture.doctor));

    expect(getRes).to.have.status(200);
    expect(getRes.body._id).to.equal(prescriptionId);

    const updateRes = await chai
      .request(app)
      .patch(`/api/v1/prescriptions/${prescriptionId}`)
      .set('Authorization', authHeader(fixture.doctor))
      .send({ notes: 'Updated prescription notes.' });

    expect(updateRes).to.have.status(200);
    expect(updateRes.body.notes).to.equal('Updated prescription notes.');

    const discontinueRes = await chai
      .request(app)
      .post(`/api/v1/prescriptions/${prescriptionId}/discontinue`)
      .set('Authorization', authHeader(fixture.doctor));

    expect(discontinueRes).to.have.status(200);
    expect(discontinueRes.body.status).to.equal('discontinued');

    const deleteRes = await chai
      .request(app)
      .delete(`/api/v1/prescriptions/${prescriptionId}`)
      .set('Authorization', authHeader(fixture.doctor));

    expect(deleteRes).to.have.status(200);
    expect(deleteRes.body.message).to.equal('Prescription deleted successfully');

    const deleted = await Prescription.findById(prescriptionId).lean();
    expect(deleted).to.equal(null);
  });

  it('creates, lists and deletes patient logs', async () => {
    const fixture = await createDashboardFixture();

    const createRes = await chai
      .request(app)
      .post('/api/v1/patient-logs')
      .set('Authorization', authHeader(fixture.nurse))
      .send({
        title: 'Patient mobility note',
        description: 'Patient walked with support in the morning.',
        patient: String(fixture.activePatient._id),
      });

    expect(createRes).to.have.status(201);
    expect(createRes.body.message).to.equal('Log created successfully');
    const logId = createRes.body.log._id;

    const listRes = await chai
      .request(app)
      .get(`/api/v1/patient-logs/${fixture.activePatient._id}`)
      .set('Authorization', authHeader(fixture.nurse));

    expect(listRes).to.have.status(200);
    const logs = Array.isArray(listRes.body)
      ? listRes.body
      : listRes.body.logs || listRes.body.patientLogs || listRes.body.data || listRes.body.items || [];
    expect(logs).to.have.length(1);
    expect(logs[0].title).to.equal('Patient mobility note');

    const deleteRes = await chai
      .request(app)
      .delete(`/api/v1/patient-logs/${logId}`)
      .set('Authorization', authHeader(fixture.nurse));

    expect(deleteRes).to.have.status(200);
    expect(deleteRes.body.message).to.equal('Log deleted successfully');

    const deleted = await PatientLog.findById(logId).lean();
    expect(deleted).to.equal(null);
  });
});
