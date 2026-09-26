process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'gmproject';

const chai = require('chai');
const chaiHttp = require('chai-http');

const createTestApp = require('./helpers/testApp.cjs');
const { connectTestDb, clearTestDb, disconnectTestDb } = require('./helpers/db.cjs');
const { seedRoles, createUser, createPatient, authHeader } = require('./helpers/fixtures.cjs');

chai.use(chaiHttp);
const { expect } = chai;
const app = createTestApp();

describe('Patient lookup by name', function () {
  this.timeout(15000);

  before(connectTestDb);
  beforeEach(clearTestDb);
  after(disconnectTestDb);

  it('returns patient ids for a partial name match in the authenticated user scope', async () => {
    const roles = await seedRoles();

    const caretaker = await createUser({
      fullname: 'Lookup Caretaker',
      email: 'lookup-caretaker@example.com',
      role: roles.caretaker,
      approvalStatus: 'approved',
    });

    const createdPatient = await createPatient({
      firstName: 'Lookup',
      lastName: 'PatientUnique',
      birthSex: 'Female',
      dateOfBirth: '1950-03-10',
      createdBy: caretaker, // or whatever User this should attribute creation to
    });

    const response = await chai
      .request(app)
      .get('/api/v1/patients/find-by-name')
      .query({ name: 'lookup patient' })
      .set('Authorization', authHeader(caretaker));

    expect(response).to.have.status(200);
    expect(response.body.name).to.equal('lookup patient');
    expect(response.body.exact).to.equal(false);
    expect(response.body.count).to.equal(1);
    expect(response.body.patients).to.deep.equal([
      {
        patientId: String(createdPatient._id),
        firstName: 'Lookup',
        lastName: 'PatientUnique',
        uuid: createdPatient.uuid,
      },
    ]);
  });
});
