process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'gmproject';

const chai = require('chai');
const chaiHttp = require('chai-http');

const createTestApp = require('./helpers/testApp.cjs');
const { connectTestDb, clearTestDb, disconnectTestDb } = require('./helpers/db.cjs');
const { seedRoles, createUser, createPatient, authHeader } = require('./helpers/fixtures.cjs');
const Organization = require('../models/Organization');
const Task = require('../models/Task');
const User = require('../models/User');

chai.use(chaiHttp);
const { expect } = chai;
const app = createTestApp();

// doctorController caches role ids in memory, and the test database is wiped
// between tests, so doctor-list tests need a freshly loaded app.
function freshApp() {
  ['../controllers/doctorController', '../routes/doctor', './helpers/testApp.cjs'].forEach((modulePath) => {
    delete require.cache[require.resolve(modulePath)];
  });
  return require('./helpers/testApp.cjs')();
}

describe('organization access control', function () {
  this.timeout(20000);

  before(connectTestDb);
  beforeEach(clearTestDb);
  after(disconnectTestDb);

  // Two organizations, each with an admin, a nurse, a doctor, a caretaker,
  // a patient and a task.
  async function setup() {
    const roles = await seedRoles();
    const make = async (tag) => {
      const admin = await createUser({
        fullname: `Admin ${tag}`, email: `admin-${tag}@test.local`, role: roles.admin, approvalStatus: 'approved',
      });
      const org = await Organization.create({ name: `Org ${tag}`, createdBy: admin._id, staff: [admin._id] });
      admin.organization = org._id;
      await admin.save();

      const nurse = await createUser({
        fullname: `Nurse ${tag}`, email: `nurse-${tag}@test.local`, role: roles.nurse,
        organization: org._id, approvalStatus: 'approved',
      });
      const doctor = await createUser({
        fullname: `Doctor ${tag}`, email: `doctor-${tag}@test.local`, role: roles.doctor,
        organization: org._id, approvalStatus: 'approved',
      });
      const caretaker = await createUser({
        fullname: `Caretaker ${tag}`, email: `caretaker-${tag}@test.local`, role: roles.caretaker,
        organization: org._id, approvalStatus: 'approved',
      });
      await User.updateOne({ _id: nurse._id }, { taxFileNumber: '123456789', accountNumber: '000111' });

      const patient = await createPatient({
        fullname: `Patient ${tag}`, caretaker, assignedNurses: [nurse], assignedDoctor: doctor, organization: org,
      });
      const task = await Task.create({
        title: `Task ${tag}`, description: `Task ${tag}`, dueDate: new Date('2026-12-01'),
        assignee: nurse._id, patient: patient._id,
      });

      return { admin, org, nurse, doctor, caretaker, patient, task };
    };

    return { a: await make('a'), b: await make('b') };
  }

  describe('admin task updates', () => {
    it('lets an admin update a task in their own organization', async () => {
      const { a } = await setup();

      const res = await chai.request(app)
        .put(`/api/v1/admin/tasks/${a.task._id}`)
        .set('Authorization', authHeader(a.admin))
        .send({ title: 'Renamed' });

      expect(res).to.have.status(200);
      expect(res.body.task.title).to.equal('Renamed');
    });

    it('blocks an admin from updating a task in another organization', async () => {
      const { a, b } = await setup();

      const res = await chai.request(app)
        .put(`/api/v1/admin/tasks/${b.task._id}`)
        .set('Authorization', authHeader(a.admin))
        .send({ title: 'Hijacked' });

      expect(res).to.have.status(403);
      const saved = await Task.findById(b.task._id).lean();
      expect(saved.title).to.equal('Task b');
    });

    it('blocks moving a task to a staff member or patient from another organization', async () => {
      const { a, b } = await setup();

      const toOtherNurse = await chai.request(app)
        .put(`/api/v1/admin/tasks/${a.task._id}`)
        .set('Authorization', authHeader(a.admin))
        .send({ assigneeId: String(b.nurse._id) });
      expect(toOtherNurse).to.have.status(403);

      const toOtherPatient = await chai.request(app)
        .put(`/api/v1/admin/tasks/${a.task._id}`)
        .set('Authorization', authHeader(a.admin))
        .send({ patientId: String(b.patient._id) });
      expect(toOtherPatient).to.have.status(403);

      const withOtherStaff = await chai.request(app)
        .put(`/api/v1/admin/tasks/${a.task._id}`)
        .set('Authorization', authHeader(a.admin))
        .send({ relatedStaffIds: [String(b.doctor._id)] });
      expect(withOtherStaff).to.have.status(403);
    });

    it('blocks an admin from deleting a task in another organization', async () => {
      const { a, b } = await setup();

      const res = await chai.request(app)
        .delete(`/api/v1/admin/tasks/${b.task._id}`)
        .set('Authorization', authHeader(a.admin));

      expect(res).to.have.status(403);
      expect(await Task.exists({ _id: b.task._id })).to.not.equal(null);
    });

    it('lets an admin delete a task in their own organization', async () => {
      const { a } = await setup();

      const res = await chai.request(app)
        .delete(`/api/v1/admin/tasks/${a.task._id}`)
        .set('Authorization', authHeader(a.admin));

      expect(res).to.have.status(200);
      expect(await Task.exists({ _id: a.task._id })).to.equal(null);
    });
  });

  describe('admin patient overview', () => {
    it('returns the overview for a patient in the admin organization without password hashes', async () => {
      const { a } = await setup();

      const res = await chai.request(app)
        .get(`/api/v1/admin/patient-overview/${a.patient._id}`)
        .set('Authorization', authHeader(a.admin));

      expect(res).to.have.status(200);
      expect(res.body.patient.caretaker).to.not.have.property('password_hash');
      res.body.patient.assignedNurses.forEach(nurse => {
        expect(nurse).to.not.have.property('password_hash');
        expect(nurse).to.not.have.property('taxFileNumber');
      });
    });

    it('blocks the overview for a patient in another organization', async () => {
      const { a, b } = await setup();

      const res = await chai.request(app)
        .get(`/api/v1/admin/patient-overview/${b.patient._id}`)
        .set('Authorization', authHeader(a.admin));

      expect(res).to.have.status(403);
      expect(res.body).to.not.have.property('patient');
    });
  });

  describe('staff lists', () => {
    it('only lists doctors from the caller organization', async () => {
      const { a } = await setup();

      const res = await chai.request(freshApp())
        .get('/api/v1/doctors')
        .set('Authorization', authHeader(a.nurse));

      expect(res).to.have.status(200);
      const emails = res.body.doctors.map(d => d.email);
      expect(emails).to.deep.equal(['doctor-a@test.local']);
    });

    it('only lists nurses from the caller organization and hides payroll details', async () => {
      const { a } = await setup();

      const res = await chai.request(app)
        .get('/api/v1/nurse/all')
        .set('Authorization', authHeader(a.caretaker));

      expect(res).to.have.status(200);
      const emails = res.body.nurses.map(n => n.email);
      expect(emails).to.deep.equal(['nurse-a@test.local']);
      const nurse = res.body.nurses[0];
      expect(nurse).to.not.have.property('taxFileNumber');
      expect(nurse).to.not.have.property('accountNumber');
      expect(nurse).to.not.have.property('password_hash');
      nurse.assignedPatients.forEach(p => expect(p).to.not.have.property('dateOfBirth'));
    });

    it('returns an empty list for a user with no organization', async () => {
      await setup();
      const roles = await seedRoles();
      const loner = await createUser({
        fullname: 'No Org', email: 'no-org@test.local', role: roles.caretaker, approvalStatus: 'pending',
      });

      const doctors = await chai.request(freshApp()).get('/api/v1/doctors').set('Authorization', authHeader(loner));
      const nurses = await chai.request(app).get('/api/v1/nurse/all').set('Authorization', authHeader(loner));

      expect(doctors).to.have.status(200);
      expect(doctors.body.doctors).to.have.length(0);
      expect(nurses).to.have.status(200);
      expect(nurses.body.nurses).to.have.length(0);
    });

    it('treats search text as plain text, not a regex', async () => {
      const { a } = await setup();

      const res = await chai.request(app)
        .get('/api/v1/nurse/all?q=.*')
        .set('Authorization', authHeader(a.caretaker));

      expect(res).to.have.status(200);
      expect(res.body.nurses).to.have.length(0);
    });
  });
});
