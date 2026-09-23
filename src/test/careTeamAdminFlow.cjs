process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'gmproject';

const chai = require('chai');
const chaiHttp = require('chai-http');
const mongoose = require('mongoose');

const createTestApp = require('./helpers/testApp.cjs');
const { connectTestDb, clearTestDb, disconnectTestDb } = require('./helpers/db.cjs');
const { seedRoles, createUser, createPatient, authHeader } = require('./helpers/fixtures.cjs');
const Task = require('../models/Task');
const DailyReport = require('../models/DailyReport');

chai.use(chaiHttp);
const { expect } = chai;
const app = createTestApp();

describe('care team and admin controller flow', function () {
  this.timeout(15000);

  before(connectTestDb);
  beforeEach(clearTestDb);
  after(disconnectTestDb);

  it('covers admin inline nurse/caretaker routes and patient overview branch', async () => {
    const roles = await seedRoles();
    const admin = await createUser({ fullname: 'Inline Admin', email: 'inline-admin@example.com', role: roles.admin });
    const nurse = await createUser({ fullname: 'Inline Nurse', email: 'inline-nurse@example.com', role: roles.nurse });
    const caretaker = await createUser({ fullname: 'Inline Caretaker', email: 'inline-caretaker@example.com', role: roles.caretaker });
    const patient = await createPatient({ fullname: 'Overview Patient', caretaker, assignedNurses: [nurse] });
    await Task.create({ description: 'Overview Task', dueDate: new Date('2026-06-01'), priority: 'high', status: 'completed', patient: patient._id, caretaker: caretaker._id, nurse_id: nurse._id });

    const approve = await chai
      .request(app)
      .post(`/api/v1/admin/admin/approve-nurse/${nurse._id}`)
      .set('Authorization', authHeader(admin));
    expect(approve).to.have.status(200);

    const nurses = await chai
      .request(app)
      .get('/api/v1/admin/nurses')
      .set('Authorization', authHeader(admin));
    expect(nurses).to.have.status(200);
    expect(nurses.body).to.be.an('array');

    const caretakers = await chai
      .request(app)
      .get('/api/v1/admin/caretakers')
      .set('Authorization', authHeader(admin));
    expect(caretakers).to.have.status(200);
    expect(caretakers.body).to.be.an('array');

    const overviewMissing = await chai
      .request(app)
      .get(`/api/v1/admin/patient-overview/${new mongoose.Types.ObjectId()}`)
      .set('Authorization', authHeader(admin));
    expect(overviewMissing).to.have.status(404);

    const overview = await chai
      .request(app)
      .get(`/api/v1/admin/patient-overview/${patient._id}`)
      .set('Authorization', authHeader(admin));
    expect(overview).to.have.status(200);
    expect(overview.body.taskCompletionRate).to.equal(100);
  });

  it('covers caretaker profile, profile update and task filter branches', async () => {
    const roles = await seedRoles();
    const caretaker = await createUser({ fullname: 'Profile Caretaker', email: 'profile-caretaker@example.com', role: roles.caretaker });
    const patient = await createPatient({ fullname: 'Caretaker Task Patient', caretaker });
    await Task.create({ description: 'Urgent Task', dueDate: new Date('2026-06-01'), priority: 'high', status: 'pending', patient: patient._id, caretaker: caretaker._id });

    const missingProfileQuery = await chai
      .request(app)
      .get('/api/v1/caretaker/profile')
      .set('Authorization', authHeader(caretaker));
    expect(missingProfileQuery).to.have.status(400);

    const profile = await chai
      .request(app)
      .get(`/api/v1/caretaker/profile?email=${encodeURIComponent(caretaker.email)}`)
      .set('Authorization', authHeader(caretaker));
    expect(profile).to.have.status(200);

    const missingUpdateId = await chai
      .request(app)
      .put('/api/v1/caretaker/profile')
      .set('Authorization', authHeader(caretaker))
      .send({ fullname: 'No Id' });
    expect(missingUpdateId).to.have.status(400);

    const updateMissingUser = await chai
      .request(app)
      .put('/api/v1/caretaker/profile')
      .set('Authorization', authHeader(caretaker))
      .send({ caretakerId: new mongoose.Types.ObjectId(), fullname: 'Missing' });
    expect(updateMissingUser).to.have.status(404);

    const update = await chai
      .request(app)
      .put('/api/v1/caretaker/profile')
      .set('Authorization', authHeader(caretaker))
      .send({ caretakerId: caretaker._id, fullname: 'Updated Caretaker' });
    expect(update).to.have.status(200);

    const invalidDueDate = await chai
      .request(app)
      .get('/api/v1/caretaker/tasks?dueDate=bad-date')
      .set('Authorization', authHeader(caretaker));
    expect(invalidDueDate).to.have.status(400);

    const invalidStatus = await chai
      .request(app)
      .get('/api/v1/caretaker/tasks?status=paused')
      .set('Authorization', authHeader(caretaker));
    expect(invalidStatus).to.have.status(400);

    const invalidSort = await chai
      .request(app)
      .get('/api/v1/caretaker/tasks?sort=priority')
      .set('Authorization', authHeader(caretaker));
    expect(invalidSort).to.have.status(400);

    const urgent = await chai
      .request(app)
      .get('/api/v1/caretaker/tasks?filter=urgent&status=pending&sort=-dueDate&page=1&limit=5')
      .set('Authorization', authHeader(caretaker));
    expect(urgent).to.have.status(200);
    expect(urgent.body.total).to.equal(1);
  });

  it('covers caretaker reports by patient and nurse list/profile branches', async () => {
    const roles = await seedRoles();
    const caretaker = await createUser({ fullname: 'Report Caretaker', email: 'report-caretaker@example.com', role: roles.caretaker });
    const nurse = await createUser({ fullname: 'Report Nurse', email: 'report-nurse@example.com', role: roles.nurse });
    const patient = await createPatient({ fullname: 'Report Patient', caretaker, assignedNurses: [nurse] });
    await DailyReport.create({ patient: patient._id, caretaker: caretaker._id, summary: 'Daily summary' });

    const missingNurseProfile = await chai
      .request(app)
      .get('/api/v1/nurse/profile')
      .set('Authorization', authHeader(nurse));
    expect(missingNurseProfile).to.have.status(400);

    const nurseProfile = await chai
      .request(app)
      .get(`/api/v1/nurse/profile?email=${encodeURIComponent(nurse.email)}`)
      .set('Authorization', authHeader(nurse));
    expect(nurseProfile).to.have.status(200);

    const allNurses = await chai
      .request(app)
      .get('/api/v1/nurse/all?search=Report&page=1&limit=5')
      .set('Authorization', authHeader(caretaker));
    expect(allNurses).to.have.status(200);

    const reports = await chai
      .request(app)
      .get(`/api/v1/caretaker/reports/patient/${patient._id}`)
      .set('Authorization', authHeader(nurse));
    expect(reports).to.have.status(200);
  });
});
