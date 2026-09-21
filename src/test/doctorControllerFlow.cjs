process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'gmproject';

const chai = require('chai');
const chaiHttp = require('chai-http');
const mongoose = require('mongoose');

const { connectTestDb, clearTestDb, disconnectTestDb } = require('./helpers/db.cjs');
const { seedRoles, createUser, createPatient, authHeader } = require('./helpers/fixtures.cjs');
const User = require('../models/User');

chai.use(chaiHttp);
const { expect } = chai;

function resetDoctorRouteCache() {
  [
    '../controllers/doctorController',
    '../routes/doctor',
    './helpers/testApp.cjs',
  ].forEach((modulePath) => {
    try {
      delete require.cache[require.resolve(modulePath)];
    } catch (_error) {
      // Ignore optional cache misses in test runs.
    }
  });
}

function freshApp() {
  resetDoctorRouteCache();
  const createTestApp = require('./helpers/testApp.cjs');
  return createTestApp();
}

function freshDoctorController() {
  resetDoctorRouteCache();
  return require('../controllers/doctorController');
}

function mockRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

describe('doctor controller flow', function () {
  this.timeout(15000);

  before(connectTestDb);
  beforeEach(clearTestDb);
  after(disconnectTestDb);

  it('covers doctor listing search and pagination branches', async () => {
    const roles = await seedRoles();
    const admin = await createUser({ fullname: 'Doctor List Admin', email: 'doctor-list-admin@example.com', role: roles.admin });
    await createUser({ fullname: 'Alpha Doctor', email: 'alpha-doctor@example.com', role: roles.doctor });
    await createUser({ fullname: 'Beta Doctor', email: 'beta-doctor@example.com', role: roles.doctor });

    const app = freshApp();
    const searched = await chai
      .request(app)
      .get('/api/v1/doctors?search=Alpha&page=1&limit=1')
      .set('Authorization', authHeader(admin));

    expect(searched).to.have.status(200);
    expect(searched.body.doctors).to.be.an('array').with.length(1);
    expect(searched.body.doctors[0].email).to.equal('alpha-doctor@example.com');
    expect(searched.body.pagination.page).to.equal(1);
  });

  it('covers doctor patient list invalid, missing doctor, forbidden and success branches', async () => {
    const roles = await seedRoles();
    const admin = await createUser({ fullname: 'Doctor Patient Admin', email: 'doctor-patient-admin@example.com', role: roles.admin });
    const caretaker = await createUser({ fullname: 'Doctor Patient Caretaker', email: 'doctor-patient-caretaker@example.com', role: roles.caretaker });
    const doctor = await createUser({ fullname: 'Assigned Patient Doctor', email: 'assigned-patient-doctor@example.com', role: roles.doctor });
    const otherDoctor = await createUser({ fullname: 'Other Patient Doctor', email: 'other-patient-doctor@example.com', role: roles.doctor });

    const app = freshApp();
    const invalid = await chai
      .request(app)
      .get('/api/v1/doctors/not-a-valid-id/patients')
      .set('Authorization', authHeader(admin));
    expect(invalid).to.have.status(400);

    const missing = await chai
      .request(app)
      .get(`/api/v1/doctors/${new mongoose.Types.ObjectId()}/patients`)
      .set('Authorization', authHeader(admin));
    expect(missing).to.have.status(404);

    const forbidden = await chai
      .request(app)
      .get(`/api/v1/doctors/${otherDoctor._id}/patients`)
      .set('Authorization', authHeader(doctor));
    expect(forbidden).to.have.status(403);

    const patient = await createPatient({ fullname: 'Doctor Visible Patient', caretaker, assignedDoctor: doctor });
    await patient.constructor.updateOne({ _id: patient._id }, { $set: { doctor: doctor._id, assignedDoctor: doctor._id } });
    await User.updateOne({ _id: doctor._id }, { $addToSet: { assignedPatients: patient._id } });

    const success = await chai
      .request(app)
      .get(`/api/v1/doctors/${doctor._id}/patients?page=1&limit=5`)
      .set('Authorization', authHeader(admin));
    expect(success).to.have.status(200);
    expect(success.body.doctor.fullname).to.equal('Assigned Patient Doctor');
    expect(success.body.pagination.page).to.equal(1);
  });

  it('covers direct assign doctor validation, missing doctor, assign and unassign branches', async () => {
    const roles = await seedRoles();
    const caretaker = await createUser({ fullname: 'Assign Doctor Caretaker', email: 'assign-doctor-caretaker@example.com', role: roles.caretaker });
    const doctor = await createUser({ fullname: 'Assignable Doctor', email: 'assignable-doctor@example.com', role: roles.doctor });
    const nurse = await createUser({ fullname: 'Not Assignable Nurse', email: 'not-assignable-nurse@example.com', role: roles.nurse });
    const patient = await createPatient({ fullname: 'Doctor Assign Patient', caretaker });
    const doctorController = freshDoctorController();

    let res = mockRes();
    await doctorController.assignDoctorToPatient({ params: { patientId: new mongoose.Types.ObjectId() }, body: { doctorId: doctor._id } }, res);
    expect(res.statusCode).to.equal(404);

    res = mockRes();
    await doctorController.assignDoctorToPatient({ params: { patientId: patient._id }, body: { doctorId: 'bad-id' } }, res);
    expect(res.statusCode).to.equal(400);

    res = mockRes();
    await doctorController.assignDoctorToPatient({ params: { patientId: patient._id }, body: { doctorId: nurse._id } }, res);
    expect(res.statusCode).to.equal(404);

    res = mockRes();
    await doctorController.assignDoctorToPatient({ params: { patientId: patient._id }, body: { doctorId: doctor._id } }, res);
    expect(res.statusCode).to.equal(200);
    expect(res.body.message).to.equal('Doctor assigned');

    res = mockRes();
    await doctorController.assignDoctorToPatient({ params: { patientId: patient._id }, body: { doctorId: null } }, res);
    expect(res.statusCode).to.equal(200);
    expect(res.body.message).to.equal('Doctor unassigned');
  });
});
