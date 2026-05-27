process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'gmproject';

const jwt = require('jsonwebtoken');
const Role = require('../../models/Role');
const User = require('../../models/User');
const Patient = require('../../models/Patient');
const Organization = require('../../models/Organization');
const Task = require('../../models/Task');

const DEFAULT_PASSWORD = 'Password123!';

async function seedRoles(names = ['admin', 'nurse', 'caretaker', 'doctor']) {
  await Promise.all(
    names.map((name) =>
      Role.updateOne(
        { name },
        { $setOnInsert: { name } },
        { upsert: true }
      )
    )
  );

  const roles = await Role.find({ name: { $in: names } }).lean();
  return roles.reduce((acc, role) => {
    acc[role.name] = role._id;
    return acc;
  }, {});
}

async function roleId(roleName) {
  let role = await Role.findOne({ name: roleName });
  if (!role) {
    role = await Role.create({ name: roleName });
  }
  return role._id;
}

async function createUser({
  fullname,
  email,
  role,
  roleName,
  organization,
  approvalStatus,
  password = DEFAULT_PASSWORD,
  assignedPatients = [],
}) {
  const resolvedRole = role || (roleName ? await roleId(roleName) : undefined);

  return User.create({
    fullname,
    email,
    password_hash: password,
    role: resolvedRole,
    organization,
    approvalStatus,
    assignedPatients,
  });
}

function signToken(user) {
  const userId = String(user._id || user.id);
  const organizationId = user.organization ? String(user.organization._id || user.organization) : undefined;

  return jwt.sign(
    {
      _id: userId,
      id: userId,
      email: user.email,
      role: user.role ? String(user.role._id || user.role) : undefined,
      organization: organizationId,
      organisation: organizationId,
    },
    process.env.JWT_SECRET,
    { expiresIn: '1h', algorithm: 'HS256' }
  );
}

function authHeader(user) {
  return `Bearer ${signToken(user)}`;
}

async function createOrganization({ name = 'Guardian Test Org', admin }) {
  return Organization.create({
    name,
    description: 'Integration test organization',
    active: true,
    createdBy: admin?._id,
    staff: admin?._id ? [admin._id] : [],
  });
}

async function createPatient({
  fullname = 'Test Patient',
  gender = 'F',
  dateOfBirth = '1985-01-01',
  caretaker,
  assignedNurses = [],
  assignedDoctor,
  organization,
  isDeleted = false,
}) {
  const patient = await Patient.create({
    fullname,
    gender,
    dateOfBirth: new Date(dateOfBirth),
    caretaker: caretaker._id || caretaker,
    assignedNurses: assignedNurses.map((nurse) => nurse._id || nurse),
    assignedDoctor: assignedDoctor ? assignedDoctor._id || assignedDoctor : undefined,
    organization: organization ? organization._id || organization : undefined,
    dateOfAdmitting: new Date('2026-04-01'),
    isDeleted,
  });

  const linkedUsers = [caretaker, ...assignedNurses, assignedDoctor].filter(Boolean);
  await Promise.all(
    linkedUsers.map((user) =>
      User.updateOne(
        { _id: user._id || user },
        { $addToSet: { assignedPatients: patient._id } }
      )
    )
  );

  return patient;
}

async function createCoreFixture() {
  const roles = await seedRoles();

  const admin = await createUser({
    fullname: 'Admin User',
    email: 'admin@test.local',
    role: roles.admin,
    approvalStatus: 'approved',
  });

  const caretaker = await createUser({
    fullname: 'Caretaker User',
    email: 'caretaker@test.local',
    role: roles.caretaker,
    approvalStatus: 'approved',
  });

  const nurse = await createUser({
    fullname: 'Nurse User',
    email: 'nurse@test.local',
    role: roles.nurse,
    approvalStatus: 'approved',
  });

  const doctor = await createUser({
    fullname: 'Doctor User',
    email: 'doctor@test.local',
    role: roles.doctor,
    approvalStatus: 'approved',
  });

  return { roles, admin, caretaker, nurse, doctor };
}

async function createDashboardFixture() {
  const fixture = await createCoreFixture();
  const activePatient = await createPatient({
    fullname: 'Active Dashboard Patient',
    caretaker: fixture.caretaker,
    assignedNurses: [fixture.nurse],
    assignedDoctor: fixture.doctor,
  });

  const deletedPatient = await createPatient({
    fullname: 'Deleted Dashboard Patient',
    caretaker: fixture.caretaker,
    assignedNurses: [fixture.nurse],
    assignedDoctor: fixture.doctor,
    isDeleted: true,
  });

  const pendingTask = await Task.create({
    description: 'Check morning vitals',
    dueDate: new Date('2026-06-01'),
    priority: 'high',
    status: 'pending',
    patient: activePatient._id,
    caretaker: fixture.caretaker._id,
    nurse_id: fixture.nurse._id,
  });

  const completedTask = await Task.create({
    description: 'Update care notes',
    dueDate: new Date('2026-06-02'),
    priority: 'medium',
    status: 'completed',
    patient: activePatient._id,
    caretaker: fixture.caretaker._id,
    nurse_id: fixture.nurse._id,
  });

  return {
    ...fixture,
    activePatient,
    deletedPatient,
    pendingTask,
    completedTask,
  };
}

module.exports = {
  DEFAULT_PASSWORD,
  seedRoles,
  createUser,
  createOrganization,
  createPatient,
  createCoreFixture,
  createDashboardFixture,
  signToken,
  authHeader,
};
