process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'gmproject';

const chai = require('chai');
const chaiHttp = require('chai-http');

const createTestApp = require('./helpers/testApp.cjs');
const { connectTestDb, clearTestDb, disconnectTestDb } = require('./helpers/db.cjs');
const { seedRoles, createUser, authHeader } = require('./helpers/fixtures.cjs');
const User = require('../models/User');
const Organization = require('../models/Organization');

chai.use(chaiHttp);
const { expect } = chai;
const app = createTestApp();

describe('organization and staff approval flow', function () {
  this.timeout(15000);

  before(connectTestDb);
  beforeEach(clearTestDb);
  after(disconnectTestDb);

  it('creates an organization, accepts a join request and approves staff', async () => {
    const roles = await seedRoles();
    const admin = await createUser({
      fullname: 'Org Flow Admin',
      email: 'org-flow-admin@example.com',
      role: roles.admin,
      approvalStatus: 'approved',
    });
    const caretaker = await createUser({
      fullname: 'Pending Caretaker',
      email: 'pending-caretaker@example.com',
      role: roles.caretaker,
    });
    const doctor = await createUser({
      fullname: 'Staff Doctor',
      email: 'staff-doctor@example.com',
      role: roles.doctor,
      approvalStatus: 'approved',
    });

    const createOrgRes = await chai
      .request(app)
      .post('/api/v1/orgs')
      .set('Authorization', authHeader(admin))
      .send({ name: 'Guardian Approval Test Org', description: 'Org flow integration test' });

    expect(createOrgRes).to.have.status(201);
    expect(createOrgRes.body.message).to.equal('Organization created');
    const orgId = createOrgRes.body.org._id;

    const publicOrgRes = await chai
      .request(app)
      .get('/api/v1/orgs/public')
      .set('Authorization', authHeader(caretaker));

    expect(publicOrgRes).to.have.status(200);
    expect(publicOrgRes.body.orgs.map((org) => org.name)).to.include('Guardian Approval Test Org');

    const joinRes = await chai
      .request(app)
      .post('/api/v1/orgs/join-request')
      .set('Authorization', authHeader(caretaker))
      .send({ orgId });

    expect(joinRes).to.have.status(200);
    expect(joinRes.body.user.approvalStatus).to.equal('pending');

    const pendingRes = await chai
      .request(app)
      .get('/api/v1/admin/staff/pending')
      .query({ orgId })
      .set('Authorization', authHeader(admin));

    expect(pendingRes).to.have.status(200);
    expect(pendingRes.body.total).to.equal(1);
    expect(pendingRes.body.pendingUsers[0].email).to.equal('pending-caretaker@example.com');

    const approveRes = await chai
      .request(app)
      .put(`/api/v1/admin/staff/${caretaker._id}/approve`)
      .query({ orgId })
      .set('Authorization', authHeader(admin));

    expect(approveRes).to.have.status(200);
    expect(approveRes.body.user.approvalStatus).to.equal('approved');

    const approvedCaretaker = await User.findById(caretaker._id).lean();
    expect(approvedCaretaker.approvalStatus).to.equal('approved');
    expect(String(approvedCaretaker.organization)).to.equal(String(orgId));

    const addDoctorRes = await chai
      .request(app)
      .post('/api/v1/admin/staff')
      .query({ orgId })
      .set('Authorization', authHeader(admin))
      .send({ userId: String(doctor._id) });

    expect(addDoctorRes).to.have.status(200);
    expect(addDoctorRes.body.message).to.equal('Staff member added');
    expect(addDoctorRes.body.organization.staff.map(String)).to.include(String(doctor._id));

    const listStaffRes = await chai
      .request(app)
      .get('/api/v1/admin/staff')
      .query({ orgId, role: 'doctor' })
      .set('Authorization', authHeader(admin));

    expect(listStaffRes).to.have.status(200);
    expect(listStaffRes.body.staff.map((staff) => staff.email)).to.include('staff-doctor@example.com');

    const deactivateRes = await chai
      .request(app)
      .put(`/api/v1/admin/staff/${doctor._id}/deactivate`)
      .query({ orgId })
      .set('Authorization', authHeader(admin));

    expect(deactivateRes).to.have.status(200);
    expect(deactivateRes.body.message).to.equal('Staff member removed');

    const orgAfterDeactivate = await Organization.findById(orgId).lean();
    expect(orgAfterDeactivate.staff.map(String)).to.not.include(String(doctor._id));
  });

  it('rejects duplicate organization names', async () => {
    const roles = await seedRoles();
    const admin = await createUser({
      fullname: 'Duplicate Org Admin',
      email: 'duplicate-org-admin@example.com',
      role: roles.admin,
      approvalStatus: 'approved',
    });

    const first = await chai
      .request(app)
      .post('/api/v1/orgs')
      .set('Authorization', authHeader(admin))
      .send({ name: 'Duplicate Org' });

    const second = await chai
      .request(app)
      .post('/api/v1/orgs')
      .set('Authorization', authHeader(admin))
      .send({ name: 'Duplicate Org' });

    expect(first).to.have.status(201);
    expect(second).to.have.status(400);
    expect(second.body.message).to.equal('Organization with this name already exists');
  });
});
