process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'gmproject';

const chai = require('chai');
const chaiHttp = require('chai-http');

const createTestApp = require('./helpers/testApp.cjs');
const { connectTestDb, clearTestDb, disconnectTestDb } = require('./helpers/db.cjs');
const {
  seedRoles,
  createUser,
  createOrganization,
  createPatient,
  authHeader,
  DEFAULT_PASSWORD,
} = require('./helpers/fixtures.cjs');
const Patient = require('../models/Patient');

chai.use(chaiHttp);
const { expect } = chai;
const app = createTestApp();

describe('patient flow', function () {
  this.timeout(15000);

  before(connectTestDb);
  beforeEach(clearTestDb);
  after(disconnectTestDb);

  it('allows a freelance caretaker to add a patient with profile and medical fields', async () => {
    const roles = await seedRoles();
    const caretaker = await createUser({
      fullname: 'Freelance Caretaker',
      email: 'freelance-caretaker@example.com',
      role: roles.caretaker,
      password: DEFAULT_PASSWORD,
    });

    const res = await chai
      .request(app)
      .post('/api/v1/patients/add')
      .set('Authorization', authHeader(caretaker))
      .send({
        fullname: 'Patient A',
        dateOfBirth: '1990-03-15',
        gender: 'F',
        emergencyContactName: 'Emergency Contact',
        emergencyContactNumber: '0400000000',
        nextOfKinName: 'Next Kin',
        nextOfKinRelationship: 'SIBLING',
        medicalSummary: 'Patient has mild asthma.',
        allergies: ['Peanuts'],
        conditions: ['Asthma'],
        notes: 'Created from integration test.',
      });

    expect(res).to.have.status(201);
    expect(res.body.message).to.equal('Patient added successfully');
    expect(res.body.patient.fullname).to.equal('Patient A');
    expect(res.body.patient.age).to.be.a('number');

    const savedPatient = await Patient.findById(res.body.patient._id).lean();
    expect(String(savedPatient.caretaker)).to.equal(String(caretaker._id));
    expect(savedPatient.medicalSummary).to.equal('Patient has mild asthma.');
    expect(savedPatient.allergies).to.deep.equal(['Peanuts']);
  });

  it('returns only the authenticated caretaker own independent patients', async () => {
    const roles = await seedRoles();
    const caretakerOne = await createUser({
      fullname: 'Caretaker One',
      email: 'caretaker-one@example.com',
      role: roles.caretaker,
    });
    const caretakerTwo = await createUser({
      fullname: 'Caretaker Two',
      email: 'caretaker-two@example.com',
      role: roles.caretaker,
    });

    await createPatient({ fullname: 'Visible Patient', caretaker: caretakerOne });
    await createPatient({ fullname: 'Hidden Patient', caretaker: caretakerTwo });

    const res = await chai
      .request(app)
      .get('/api/v1/patients')
      .set('Authorization', authHeader(caretakerOne));

    expect(res).to.have.status(200);
    expect(res.body.total).to.equal(1);
    expect(res.body.patients.map((patient) => patient.fullname)).to.deep.equal(['Visible Patient']);
  });

  it('allows an assigned nurse to update an assigned patient', async () => {
    const roles = await seedRoles();
    const caretaker = await createUser({
      fullname: 'Assigned Caretaker',
      email: 'assigned-caretaker@example.com',
      role: roles.caretaker,
    });
    const nurse = await createUser({
      fullname: 'Assigned Nurse',
      email: 'assigned-nurse@example.com',
      role: roles.nurse,
    });
    const patient = await createPatient({
      fullname: 'Nurse Editable Patient',
      caretaker,
      assignedNurses: [nurse],
    });

    const res = await chai
      .request(app)
      .put(`/api/v1/patients/${patient._id}`)
      .set('Authorization', authHeader(nurse))
      .send({
        notes: 'Updated by assigned nurse during integration testing.',
        conditions: ['Hypertension'],
      });

    expect(res).to.have.status(200);
    expect(res.body.message).to.equal('Patient updated successfully');
    expect(res.body.patient.notes).to.equal('Updated by assigned nurse during integration testing.');
    expect(res.body.patient.conditions).to.deep.equal(['Hypertension']);
  });

  it('blocks approved organization caretakers from using independent patient creation', async () => {
    const roles = await seedRoles();
    const admin = await createUser({
      fullname: 'Org Admin',
      email: 'org-admin@example.com',
      role: roles.admin,
      approvalStatus: 'approved',
    });
    const organization = await createOrganization({ name: 'Patient Flow Org', admin });
    const orgCaretaker = await createUser({
      fullname: 'Approved Org Caretaker',
      email: 'approved-org-caretaker@example.com',
      role: roles.caretaker,
      organization: organization._id,
      approvalStatus: 'approved',
    });

    const res = await chai
      .request(app)
      .post('/api/v1/patients/add')
      .set('Authorization', authHeader(orgCaretaker))
      .send({
        fullname: 'Blocked Org Patient',
        dateOfBirth: '1988-01-01',
        gender: 'F',
      });

    expect(res).to.have.status(403);
    expect(res.body.message).to.contain('Approved organization members cannot manage patients independently');
  });
});
