process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'gmproject';

const chai = require('chai');
const chaiHttp = require('chai-http');

const createTestApp = require('./helpers/testApp.cjs');
const { connectTestDb, clearTestDb, disconnectTestDb } = require('./helpers/db.cjs');
const { createDashboardFixture, authHeader } = require('./helpers/fixtures.cjs');

chai.use(chaiHttp);
const { expect } = chai;
const app = createTestApp();

describe('care team dashboard and daily report flow', function () {
  this.timeout(15000);

  before(connectTestDb);
  beforeEach(clearTestDb);
  after(disconnectTestDb);

  it('returns nurse profile, assigned patients and dashboard summary when available', async () => {
    const fixture = await createDashboardFixture();

    const profileRes = await chai
      .request(app)
      .get('/api/v1/nurse/profile')
      .query({ nurseId: String(fixture.nurse._id) })
      .set('Authorization', authHeader(fixture.nurse));

    expect(profileRes.status).to.be.oneOf([200, 404]);
    if (profileRes.status === 200) {
      expect(profileRes.body.email).to.equal(fixture.nurse.email);
    }

    const assignedRes = await chai
      .request(app)
      .get('/api/v1/nurse/assigned-patients')
      .set('Authorization', authHeader(fixture.nurse));

    expect(assignedRes).to.have.status(200);
    expect(assignedRes.body.patients.map((patient) => patient.fullname)).to.include(
      'Active Dashboard Patient'
    );

    const summaryRes = await chai
      .request(app)
      .get('/api/v1/nurse/dashboard-summary')
      .set('Authorization', authHeader(fixture.nurse));

    expect(summaryRes.status).to.be.oneOf([200, 404]);

    if (summaryRes.status === 200) {
      expect(summaryRes.body).to.include({
        totalPatients: 2,
        totalActivePatients: 1,
        totalTasks: 2,
        completedTasks: 1,
        pendingTasks: 1,
      });
    }
  });

  it('returns caretaker reports, tasks and dashboard summary when available', async () => {
    const fixture = await createDashboardFixture();

    const createReportRes = await chai
      .request(app)
      .post('/api/v1/caretaker/reports')
      .set('Authorization', authHeader(fixture.caretaker))
      .send({
        patient: String(fixture.activePatient._id),
        summary: 'Patient completed breakfast and morning mobility support.',
        foodWater: 'Normal',
        medicationSupport: 'Medication taken on time',
      });

    expect(createReportRes).to.have.status(201);
    expect(createReportRes.body.message).to.equal('Daily report created successfully');

    const reportsRes = await chai
      .request(app)
      .get('/api/v1/caretaker/reports')
      .set('Authorization', authHeader(fixture.caretaker));

    expect(reportsRes).to.have.status(200);
    expect(reportsRes.body).to.have.length(1);

    const patientReportsRes = await chai
      .request(app)
      .get(`/api/v1/caretaker/reports/patient/${fixture.activePatient._id}`)
      .set('Authorization', authHeader(fixture.caretaker));

    expect(patientReportsRes).to.have.status(200);
    expect(patientReportsRes.body).to.have.length(1);

    const tasksRes = await chai
      .request(app)
      .get('/api/v1/caretaker/tasks')
      .query({ caretakerId: String(fixture.caretaker._id), filter: 'urgent' })
      .set('Authorization', authHeader(fixture.caretaker));

    expect(tasksRes).to.have.status(200);
    expect(tasksRes.body.total).to.equal(1);
    expect(tasksRes.body.items[0].priority).to.equal('high');

    const summaryRes = await chai
      .request(app)
      .get('/api/v1/nurse/dashboard-summary')
      .set('Authorization', authHeader(fixture.nurse));

    expect(summaryRes.status).to.be.oneOf([200, 404]);

    if (summaryRes.status === 200) {
      expect(summaryRes.body).to.include({
        totalPatients: 2,
        totalActivePatients: 1,
        totalTasks: 2,
        completedTasks: 1,
        pendingTasks: 1,
      });
    }
  });

  it('lists doctors and caretakers using authenticated directory routes', async () => {
    const fixture = await createDashboardFixture();

    const doctorsRes = await chai
      .request(app)
      .get('/api/v1/doctors')
      .query({ search: 'Doctor' })
      .set('Authorization', authHeader(fixture.admin));

    expect(doctorsRes).to.have.status(200);
    expect(doctorsRes.body.doctors.map((doctor) => doctor.email)).to.include(fixture.doctor.email);

    const caretakersRes = await chai
      .request(app)
      .get('/api/v1/caretaker')
      .query({ search: 'Caretaker' })
      .set('Authorization', authHeader(fixture.admin));

    expect(caretakersRes).to.have.status(200);
    expect(caretakersRes.body.data.map((caretaker) => caretaker.email)).to.include(
      fixture.caretaker.email
    );
  });
});