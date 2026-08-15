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

describe('Patient lookup by name', function () {
  this.timeout(30000);

  let app;
  let mongoServer;
  let Role;
  let User;
  let Patient;
  let caretaker;
  let caretakerToken;
  let createdPatient;

  before(async function () {
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'patient-lookup-test-secret';

    mongoServer = await MongoMemoryServer.create();
    process.env.MONGODB_URI = mongoServer.getUri('guardian-patient-lookup-test');

    delete require.cache[require.resolve('../server')];
    delete require.cache[require.resolve('../config/db')];

    app = require('../server');
    await mongoose.connection.asPromise();

    Role = require('../models/Role');
    User = require('../models/User');
    Patient = require('../models/Patient');

    const caretakerRole = await waitForRole(Role, 'caretaker');

    caretaker = await User.create({
      fullname: 'Lookup Caretaker',
      email: 'lookup-caretaker@example.com',
      password_hash: 'Password123!',
      role: caretakerRole._id,
    });

    createdPatient = await Patient.create({
      fullname: 'Lookup Patient Unique',
      gender: 'F',
      dateOfBirth: new Date('1950-03-10'),
      caretaker: caretaker._id,
    });

    caretakerToken = jwt.sign(
      { _id: caretaker._id, email: caretaker.email },
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

  it('returns patient ids for a partial name match in the authenticated user scope', async function () {
    const response = await chai
      .request(app)
      .get('/api/v1/patients/find-by-name')
      .query({ name: 'lookup patient' })
      .set('Authorization', `Bearer ${caretakerToken}`);

    expect(response).to.have.status(200);
    expect(response.body.name).to.equal('lookup patient');
    expect(response.body.exact).to.equal(false);
    expect(response.body.count).to.equal(1);
    expect(response.body.patients).to.deep.equal([
      {
        patientId: String(createdPatient._id),
        fullname: 'Lookup Patient Unique',
        uuid: createdPatient.uuid,
      },
    ]);

    const openApiResponse = await chai.request(app).get('/openapi.json');
    expect(openApiResponse).to.have.status(200);
    expect(openApiResponse.body.paths).to.have.property('/api/v1/patients/find-by-name');
  });
});
