const chai = require('chai');
const chaiHttp = require('chai-http');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

chai.use(chaiHttp);

const { expect } = chai;

async function waitForRole(Role, roleName) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const role = await Role.findOne({ name: roleName });
    if (role) return role;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`Timed out waiting for seeded ${roleName} role`);
}

describe('Patient logs as patient notes', function () {
  this.timeout(30000);

  let app;
  let mongoServer;
  let Role;
  let User;
  let Patient;
  let PatientLog;
  let nurse;
  let caretaker;
  let nurseToken;
  let patient;

  before(async function () {
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'patient-log-test-secret';

    mongoServer = await MongoMemoryServer.create();
    process.env.MONGODB_URI = mongoServer.getUri('guardian-patient-log-test');

    delete require.cache[require.resolve('../server')];
    delete require.cache[require.resolve('../config/db')];

    app = require('../server');
    await mongoose.connection.asPromise();

    Role = require('../models/Role');
    User = require('../models/User');
    Patient = require('../models/Patient');
    PatientLog = require('../models/PatientLog');

    const nurseRole = await waitForRole(Role, 'nurse');
    const caretakerRole = await waitForRole(Role, 'caretaker');

    nurse = await User.create({
      fullname: 'Patient Note Nurse',
      email: 'patient-note-nurse@example.com',
      password_hash: 'Password123!',
      role: nurseRole._id,
    });

    caretaker = await User.create({
      fullname: 'Patient Note Caretaker',
      email: 'patient-note-caretaker@example.com',
      password_hash: 'Password123!',
      role: caretakerRole._id,
    });

    patient = await Patient.create({
      fullname: 'Patient Note Subject',
      gender: 'M',
      dateOfBirth: new Date('1955-09-10'),
      caretaker: caretaker._id,
    });

    nurseToken = jwt.sign(
      { _id: nurse._id, email: nurse.email },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
  });

  after(async function () {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.dropDatabase();
      await mongoose.connection.close();
    }

    if (mongoServer) {
      await mongoServer.stop();
    }

    if (app?.server?.listening) {
      await new Promise((resolve) => app.server.close(resolve));
    }
  });

  it('creates and fetches patient notes through the patient-logs endpoint', async function () {
    const createResponse = await chai
      .request(app)
      .post('/api/v1/patient-logs')
      .set('Authorization', `Bearer ${nurseToken}`)
      .send({
        patient: String(patient._id),
        location: 'care_facility',
        address: '12 King Street',
        title: 'Hydration follow-up',
        observations: 'Patient finished two glasses of water after medication round.',
        actionsRequired: ['Continue hydration prompts'],
      });

    expect(createResponse).to.have.status(201);
    expect(createResponse.body.message).to.equal('Patient note created successfully');
    expect(createResponse.body.log).to.include({
      title: 'Hydration follow-up',
      observations: 'Patient finished two glasses of water after medication round.',
      location: 'care_facility',
      address: '12 King Street',
    });
    expect(createResponse.body.log.author.fullname).to.equal('Patient Note Nurse');

    const fetchResponse = await chai
      .request(app)
      .get(`/api/v1/patient-logs/${patient._id}`)
      .set('Authorization', `Bearer ${nurseToken}`);

    expect(fetchResponse).to.have.status(200);
    expect(fetchResponse.body).to.have.lengthOf(1);
    expect(fetchResponse.body[0]).to.include({
      title: 'Hydration follow-up',
      observations: 'Patient finished two glasses of water after medication round.',
      location: 'care_facility',
    });
    expect(fetchResponse.body[0].author.fullname).to.equal('Patient Note Nurse');

    const storedLogs = await PatientLog.countDocuments({ patient: patient._id });
    expect(storedLogs).to.equal(1);
  });
});
