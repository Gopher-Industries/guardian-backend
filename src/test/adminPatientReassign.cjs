process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'gmproject';

const chai = require('chai');
const mongoose = require('mongoose');

const adminPatientController = require('../controllers/adminPatientController');
const Organization = require('../models/Organization');
const Patient = require('../models/Patient');
const Role = require('../models/Role');
const User = require('../models/User');

const { expect } = chai;

const MONGODB_URI =
  process.env.MONGODB_URI || 'mongodb://admin:password@localhost:27018/guardian_test?authSource=admin';

function makeRes() {
  return {
    statusCode: 200,
    body: null,
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

async function createRoleMap() {
  const roles = await Role.create([
    { name: 'admin' },
    { name: 'nurse' },
    { name: 'caretaker' },
    { name: 'doctor' },
  ]);

  return roles.reduce((acc, role) => {
    acc[role.name] = role._id;
    return acc;
  }, {});
}

async function createUser({ fullname, email, role, organization }) {
  return User.create({
    fullname,
    email,
    password_hash: 'Password123!',
    role,
    organization,
  });
}

async function buildFixture() {
  const roleIds = await createRoleMap();

  const admin = await createUser({
    fullname: 'Admin User',
    email: 'admin@test.local',
    role: roleIds.admin,
  });

  const organization = await Organization.create({
    name: 'Guardian Test Org',
    description: 'Test organization',
    active: true,
    createdBy: admin._id,
    staff: [admin._id],
  });

  const [oldCaretaker, newCaretaker, oldNurse, newNurse, oldDoctor, newDoctor] = await Promise.all([
    createUser({
      fullname: 'Old Caretaker',
      email: 'old-caretaker@test.local',
      role: roleIds.caretaker,
      organization: organization._id,
    }),
    createUser({
      fullname: 'New Caretaker',
      email: 'new-caretaker@test.local',
      role: roleIds.caretaker,
      organization: organization._id,
    }),
    createUser({
      fullname: 'Old Nurse',
      email: 'old-nurse@test.local',
      role: roleIds.nurse,
      organization: organization._id,
    }),
    createUser({
      fullname: 'New Nurse',
      email: 'new-nurse@test.local',
      role: roleIds.nurse,
      organization: organization._id,
    }),
    createUser({
      fullname: 'Old Doctor',
      email: 'old-doctor@test.local',
      role: roleIds.doctor,
      organization: organization._id,
    }),
    createUser({
      fullname: 'New Doctor',
      email: 'new-doctor@test.local',
      role: roleIds.doctor,
      organization: organization._id,
    }),
  ]);

  await Organization.updateOne(
    { _id: organization._id },
    {
      $addToSet: {
        staff: { $each: [oldNurse._id, newNurse._id, oldDoctor._id, newDoctor._id] },
      },
    }
  );

  const patient = await Patient.create({
    fullname: 'Patient Zero',
    gender: 'male',
    dateOfBirth: new Date('1980-05-17'),
    organization: organization._id,
    caretaker: oldCaretaker._id,
    assignedNurses: [oldNurse._id],
    assignedDoctor: oldDoctor._id,
    dateOfAdmitting: new Date('2026-03-26'),
  });

  await Promise.all([
    User.updateOne({ _id: oldCaretaker._id }, { $addToSet: { assignedPatients: patient._id } }),
    User.updateOne({ _id: oldNurse._id }, { $addToSet: { assignedPatients: patient._id } }),
    User.updateOne({ _id: oldDoctor._id }, { $addToSet: { assignedPatients: patient._id } }),
  ]);

  return {
    admin,
    organization,
    patient,
    oldCaretaker,
    newCaretaker,
    oldNurse,
    newNurse,
    oldDoctor,
    newDoctor,
  };
}

async function buildSecondOrg(roleIds) {
  const otherAdmin = await createUser({
    fullname: 'Other Admin',
    email: 'other-admin@test.local',
    role: roleIds.admin,
  });

  const otherOrganization = await Organization.create({
    name: 'Other Test Org',
    description: 'Second organization',
    active: true,
    createdBy: otherAdmin._id,
    staff: [otherAdmin._id],
  });

  const [otherCaretaker, otherNurse, otherDoctor] = await Promise.all([
    createUser({
      fullname: 'Other Caretaker',
      email: 'other-caretaker@test.local',
      role: roleIds.caretaker,
      organization: otherOrganization._id,
    }),
    createUser({
      fullname: 'Other Nurse',
      email: 'other-nurse@test.local',
      role: roleIds.nurse,
      organization: otherOrganization._id,
    }),
    createUser({
      fullname: 'Other Doctor',
      email: 'other-doctor@test.local',
      role: roleIds.doctor,
      organization: otherOrganization._id,
    }),
  ]);

  await Organization.updateOne(
    { _id: otherOrganization._id },
    {
      $addToSet: {
        staff: { $each: [otherNurse._id, otherDoctor._id] },
      },
    }
  );

  return {
    otherAdmin,
    otherOrganization,
    otherCaretaker,
    otherNurse,
    otherDoctor,
  };
}

describe('admin patient reassign flow', function () {
  this.timeout(15000);

  before(async () => {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000,
    });
  });

  beforeEach(async () => {
    await mongoose.connection.db.dropDatabase();
  });

  after(async () => {
    await mongoose.disconnect();
  });

  it('reassigns caretaker, nurse, and doctor in the same org and removes old reverse assignments', async () => {
    const fixture = await buildFixture();
    const req = {
      params: { id: String(fixture.patient._id) },
      query: { orgId: String(fixture.organization._id) },
      body: {
        caretakerId: String(fixture.newCaretaker._id),
        nurseId: String(fixture.newNurse._id),
        doctorId: String(fixture.newDoctor._id),
      },
      user: { _id: String(fixture.admin._id) },
    };
    const res = makeRes();

    await adminPatientController.reassign(req, res);

    expect(res.statusCode).to.equal(200);
    expect(res.body.message).to.equal('Assignments updated');
    expect(String(res.body.patient.caretaker._id)).to.equal(String(fixture.newCaretaker._id));
    expect(String(res.body.patient.assignedDoctor._id)).to.equal(String(fixture.newDoctor._id));
    expect(res.body.patient.assignedNurses).to.have.length(1);
    expect(String(res.body.patient.assignedNurses[0]._id)).to.equal(String(fixture.newNurse._id));

    const updatedPatient = await Patient.findById(fixture.patient._id).lean();
    expect(String(updatedPatient.caretaker)).to.equal(String(fixture.newCaretaker._id));
    expect(String(updatedPatient.assignedDoctor)).to.equal(String(fixture.newDoctor._id));
    expect(updatedPatient.assignedNurses.map(String)).to.deep.equal([String(fixture.newNurse._id)]);

    const [
      oldCaretaker,
      newCaretaker,
      oldNurse,
      newNurse,
      oldDoctor,
      newDoctor,
    ] = await Promise.all([
      User.findById(fixture.oldCaretaker._id).lean(),
      User.findById(fixture.newCaretaker._id).lean(),
      User.findById(fixture.oldNurse._id).lean(),
      User.findById(fixture.newNurse._id).lean(),
      User.findById(fixture.oldDoctor._id).lean(),
      User.findById(fixture.newDoctor._id).lean(),
    ]);

    expect((oldCaretaker.assignedPatients || []).map(String)).to.not.include(String(fixture.patient._id));
    expect((oldNurse.assignedPatients || []).map(String)).to.not.include(String(fixture.patient._id));
    expect((oldDoctor.assignedPatients || []).map(String)).to.not.include(String(fixture.patient._id));

    expect((newCaretaker.assignedPatients || []).map(String)).to.include(String(fixture.patient._id));
    expect((newNurse.assignedPatients || []).map(String)).to.include(String(fixture.patient._id));
    expect((newDoctor.assignedPatients || []).map(String)).to.include(String(fixture.patient._id));
  });

  it('still updates nurse and doctor when caretaker is unchanged', async () => {
    const fixture = await buildFixture();
    const req = {
      params: { id: String(fixture.patient._id) },
      query: { orgId: String(fixture.organization._id) },
      body: {
        caretakerId: String(fixture.oldCaretaker._id),
        nurseId: String(fixture.newNurse._id),
        doctorId: String(fixture.newDoctor._id),
      },
      user: { _id: String(fixture.admin._id) },
    };
    const res = makeRes();

    await adminPatientController.reassign(req, res);

    expect(res.statusCode).to.equal(200);
    expect(res.body.message).to.equal('Assignments updated');
    expect(String(res.body.patient.caretaker._id)).to.equal(String(fixture.oldCaretaker._id));
    expect(String(res.body.patient.assignedDoctor._id)).to.equal(String(fixture.newDoctor._id));
    expect(res.body.patient.assignedNurses).to.have.length(1);
    expect(String(res.body.patient.assignedNurses[0]._id)).to.equal(String(fixture.newNurse._id));

    const [oldNurse, newNurse, oldDoctor, newDoctor] = await Promise.all([
      User.findById(fixture.oldNurse._id).lean(),
      User.findById(fixture.newNurse._id).lean(),
      User.findById(fixture.oldDoctor._id).lean(),
      User.findById(fixture.newDoctor._id).lean(),
    ]);

    expect((oldNurse.assignedPatients || []).map(String)).to.not.include(String(fixture.patient._id));
    expect((oldDoctor.assignedPatients || []).map(String)).to.not.include(String(fixture.patient._id));
    expect((newNurse.assignedPatients || []).map(String)).to.include(String(fixture.patient._id));
    expect((newDoctor.assignedPatients || []).map(String)).to.include(String(fixture.patient._id));
  });

  it('rejects assignments when the provided ids do not match the expected roles', async () => {
    const fixture = await buildFixture();
    const req = {
      params: { id: String(fixture.patient._id) },
      query: { orgId: String(fixture.organization._id) },
      body: {
        nurseId: String(fixture.newDoctor._id),
      },
      user: { _id: String(fixture.admin._id) },
    };
    const res = makeRes();

    await adminPatientController.reassign(req, res);

    expect(res.statusCode).to.equal(400);
    expect(res.body).to.deep.equal({ message: 'nurseId must be a nurse' });
  });

  it('returns 400 when reassign is called with an empty body', async () => {
    const fixture = await buildFixture();
    const req = {
      params: { id: String(fixture.patient._id) },
      query: { orgId: String(fixture.organization._id) },
      body: {},
      user: { _id: String(fixture.admin._id) },
    };
    const res = makeRes();

    await adminPatientController.reassign(req, res);

    expect(res.statusCode).to.equal(400);
    expect(res.body).to.deep.equal({
      message: 'At least one of nurseId, doctorId, or caretakerId is required'
    });
  });

  it('does not mutate reverse links when reassign fails after partial validation', async () => {
    const fixture = await buildFixture();
    const req = {
      params: { id: String(fixture.patient._id) },
      query: { orgId: String(fixture.organization._id) },
      body: {
        nurseId: String(fixture.newNurse._id),
        doctorId: String(fixture.newCaretaker._id),
      },
      user: { _id: String(fixture.admin._id) },
    };
    const res = makeRes();

    await adminPatientController.reassign(req, res);

    expect(res.statusCode).to.equal(400);
    expect(res.body).to.deep.equal({ message: 'doctorId must be a doctor' });

    const [patient, oldNurse, newNurse, oldDoctor] = await Promise.all([
      Patient.findById(fixture.patient._id).lean(),
      User.findById(fixture.oldNurse._id).lean(),
      User.findById(fixture.newNurse._id).lean(),
      User.findById(fixture.oldDoctor._id).lean(),
    ]);

    expect(patient.assignedNurses.map(String)).to.deep.equal([String(fixture.oldNurse._id)]);
    expect(String(patient.assignedDoctor)).to.equal(String(fixture.oldDoctor._id));
    expect((oldNurse.assignedPatients || []).map(String)).to.include(String(fixture.patient._id));
    expect((newNurse.assignedPatients || []).map(String)).to.not.include(String(fixture.patient._id));
    expect((oldDoctor.assignedPatients || []).map(String)).to.include(String(fixture.patient._id));
  });

  it('blocks cross-org reassignment attempts for staff and caretakers', async () => {
    const fixture = await buildFixture();
    const roleIds = await Role.find({}).lean().then((roles) => roles.reduce((acc, role) => {
      acc[role.name] = role._id;
      return acc;
    }, {}));
    const otherOrg = await buildSecondOrg(roleIds);

    const doctorReq = {
      params: { id: String(fixture.patient._id) },
      query: { orgId: String(fixture.organization._id) },
      body: {
        doctorId: String(otherOrg.otherDoctor._id),
      },
      user: { _id: String(fixture.admin._id) },
    };
    const doctorRes = makeRes();

    await adminPatientController.reassign(doctorReq, doctorRes);

    expect(doctorRes.statusCode).to.equal(400);
    expect(doctorRes.body).to.deep.equal({ message: 'doctorId must be a doctor in this org' });

    const caretakerReq = {
      params: { id: String(fixture.patient._id) },
      query: { orgId: String(fixture.organization._id) },
      body: {
        caretakerId: String(otherOrg.otherCaretaker._id),
      },
      user: { _id: String(fixture.admin._id) },
    };
    const caretakerRes = makeRes();

    await adminPatientController.reassign(caretakerReq, caretakerRes);

    expect(caretakerRes.statusCode).to.equal(400);
    expect(caretakerRes.body).to.deep.equal({ message: 'Caretaker belongs to another organization' });
  });

  it('blocks create-patient attempts when the caretaker belongs to another org', async () => {
    const fixture = await buildFixture();
    const roleIds = await Role.find({}).lean().then((roles) => roles.reduce((acc, role) => {
      acc[role.name] = role._id;
      return acc;
    }, {}));
    const otherOrg = await buildSecondOrg(roleIds);

    const req = {
      query: { orgId: String(fixture.organization._id) },
      body: {
        fullname: 'Blocked Patient',
        gender: 'male',
        dateOfBirth: '1985-01-01',
        caretakerId: String(otherOrg.otherCaretaker._id),
      },
      user: { _id: String(fixture.admin._id) },
    };
    const res = makeRes();

    await adminPatientController.createPatient(req, res);

    expect(res.statusCode).to.equal(400);
    expect(res.body).to.deep.equal({ message: 'Caretaker belongs to another organization' });
  });

  it('does not link a freelance caretaker to the org when create fails later', async () => {
    const fixture = await buildFixture();
    const roles = await Role.find({}).lean();
    const roleIds = roles.reduce((acc, role) => {
      acc[role.name] = role._id;
      return acc;
    }, {});
    const freelanceCaretaker = await createUser({
      fullname: 'Freelance Caretaker',
      email: 'freelance-caretaker@test.local',
      role: roleIds.caretaker,
    });

    const req = {
      query: { orgId: String(fixture.organization._id) },
      body: {
        fullname: 'Failed Patient',
        gender: 'male',
        dateOfBirth: '1985-01-01',
        caretakerId: String(freelanceCaretaker._id),
        doctorId: String(fixture.newCaretaker._id),
      },
      user: { _id: String(fixture.admin._id) },
    };
    const res = makeRes();

    await adminPatientController.createPatient(req, res);

    expect(res.statusCode).to.equal(400);
    expect(res.body).to.deep.equal({ message: 'doctorId must be a doctor' });

    const reloadedCaretaker = await User.findById(freelanceCaretaker._id).lean();
    const failedPatient = await Patient.findOne({ fullname: 'Failed Patient' }).lean();

    expect(reloadedCaretaker.organization || null).to.equal(null);
    expect(failedPatient).to.equal(null);
  });

  it('blocks explicit org access when the admin does not belong to that org', async () => {
    const fixture = await buildFixture();
    const roleIds = await Role.find({}).lean().then((roles) => roles.reduce((acc, role) => {
      acc[role.name] = role._id;
      return acc;
    }, {}));
    const otherOrg = await buildSecondOrg(roleIds);

    const req = {
      params: { id: String(fixture.patient._id) },
      query: { orgId: String(otherOrg.otherOrganization._id) },
      body: {
        nurseId: String(fixture.newNurse._id),
      },
      user: { _id: String(fixture.admin._id) },
    };
    const res = makeRes();

    await adminPatientController.reassign(req, res);

    expect(res.statusCode).to.equal(404);
    expect(res.body).to.deep.equal({ message: 'Organization not found for admin' });
  });
});
