process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'gmproject';

const chai = require('chai');
const chaiHttp = require('chai-http');

const createTestApp = require('./helpers/testApp.cjs');
const {
  connectTestDb,
  clearTestDb,
  disconnectTestDb
} = require('./helpers/db.cjs');
const {
  seedRoles,
  createUser,
  createPatient,
  createOrganization,
  authHeader
} = require('./helpers/fixtures.cjs');

const MedicalRecord = require('../models/MedicalRecord');

chai.use(chaiHttp);
const { expect } = chai;
const app = createTestApp();

describe('medical record organization access control', function () {
  this.timeout(15000);

  before(connectTestDb);
  beforeEach(clearTestDb);
  after(disconnectTestDb);

  it('prevents an admin from accessing appointments in another organization', async () => {
    const roles = await seedRoles();

    const adminA = await createUser({
      fullname: 'Organization A Admin',
      email: 'admin-a@example.com',
      role: roles.admin
    });

    const adminB = await createUser({
      fullname: 'Organization B Admin',
      email: 'admin-b@example.com',
      role: roles.admin
    });

    const organizationA = await createOrganization({
      name: 'Organization A',
      admin: adminA
    });

    const organizationB = await createOrganization({
      name: 'Organization B',
      admin: adminB
    });

    adminA.organization = organizationA._id;
    await adminA.save();

    adminB.organization = organizationB._id;
    await adminB.save();

    const doctorB = await createUser({
      fullname: 'Organization B Doctor',
      email: 'doctor-b@example.com',
      role: roles.doctor,
      organization: organizationB._id
    });

    const caretakerB = await createUser({
      fullname: 'Organization B Caretaker',
      email: 'caretaker-b@example.com',
      role: roles.caretaker,
      organization: organizationB._id
    });
    
    const patientB = await createPatient({
      fullname: 'Organization B Patient',
      caretaker: caretakerB._id,    
      assignedDoctor: doctorB,
      organization: organizationB._id
    });

    const appointmentB = await MedicalRecord.create({
      patient: patientB._id,
      doctor: doctorB._id,
      organization: organizationB._id,
      location: 'Organization B Clinic',
      appointmentDateTime: new Date('2026-10-01T10:00:00Z'),
      createdBy: adminB._id
    });

    const sameOrganizationResponse = await chai
      .request(app)
      .get(`/api/v1/medical-records/${appointmentB._id}`)
      .set('Authorization', authHeader(adminB));

    expect(sameOrganizationResponse).to.have.status(200);       

    const listResponse = await chai
      .request(app)
      .get('/api/v1/medical-records')
      .set('Authorization', authHeader(adminA));

    expect(listResponse).to.have.status(200);
    expect(listResponse.body.data).to.be.an('array').that.is.empty;

    const crossOrganizationQueryResponse = await chai
     .request(app)
     .get(`/api/v1/medical-records?organization=${organizationB._id}`)
     .set('Authorization', authHeader(adminA));

    expect(crossOrganizationQueryResponse).to.have.status(403);

    const crossOrganizationUpdateResponse = await chai
     .request(app)
     .patch(`/api/v1/medical-records/${appointmentB._id}`)
     .set('Authorization', authHeader(adminA))
     .send({
    location: 'Unauthorized Updated Clinic'
    });

    expect(crossOrganizationUpdateResponse).to.have.status(403);

    const crossOrganizationDeleteResponse = await chai
     .request(app)
     .delete(`/api/v1/medical-records/${appointmentB._id}`)
     .set('Authorization', authHeader(adminA));

    expect(crossOrganizationDeleteResponse).to.have.status(403);

    const directResponse = await chai
      .request(app)
      .get(`/api/v1/medical-records/${appointmentB._id}`)
      .set('Authorization', authHeader(adminA));

    expect(directResponse).to.have.status(403);
  });
});
