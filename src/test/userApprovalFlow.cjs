process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'gmproject';

const chai = require('chai');
const chaiHttp = require('chai-http');

const createTestApp = require('./helpers/testApp.cjs');
const { connectTestDb, clearTestDb, disconnectTestDb } = require('./helpers/db.cjs');
const { seedRoles, createUser, authHeader } = require('./helpers/fixtures.cjs');
const Organization = require('../models/Organization');
const User = require('../models/User');

chai.use(chaiHttp);
const { expect } = chai;
const app = createTestApp();

describe('user approval and role checks', function () {
  this.timeout(15000);

  before(connectTestDb);
  beforeEach(clearTestDb);
  after(disconnectTestDb);

  async function setup() {
    const roles = await seedRoles();

    const adminA = await createUser({
      fullname: 'Admin A', email: 'admin-a@test.local', role: roles.admin, approvalStatus: 'approved',
    });
    const adminB = await createUser({
      fullname: 'Admin B', email: 'admin-b@test.local', role: roles.admin, approvalStatus: 'approved',
    });
    const orgA = await Organization.create({ name: 'Org A', createdBy: adminA._id, staff: [adminA._id] });
    const orgB = await Organization.create({ name: 'Org B', createdBy: adminB._id, staff: [adminB._id] });
    adminA.organization = orgA._id;
    adminB.organization = orgB._id;
    await adminA.save();
    await adminB.save();

    const pendingNurse = await createUser({
      fullname: 'Pending Nurse', email: 'pending@test.local', role: roles.nurse,
      organization: orgA._id, approvalStatus: 'pending',
    });
    const otherPending = await createUser({
      fullname: 'Other Pending', email: 'other-pending@test.local', role: roles.caretaker,
      organization: orgA._id, approvalStatus: 'pending',
    });

    return { roles, adminA, adminB, orgA, orgB, pendingNurse, otherPending };
  }

  it('lets an admin approve a pending user in their own organization', async () => {
    const { adminA, pendingNurse } = await setup();

    const res = await chai.request(app)
      .patch(`/api/v1/auth/approve/${pendingNurse._id}`)
      .set('Authorization', authHeader(adminA));

    expect(res).to.have.status(200);
    const saved = await User.findById(pendingNurse._id).lean();
    expect(saved.approvalStatus).to.equal('approved');
    expect(String(saved.approvedBy)).to.equal(String(adminA._id));
  });

  it('does not let an admin approve a user from another organization', async () => {
    const { adminB, pendingNurse } = await setup();

    const res = await chai.request(app)
      .patch(`/api/v1/auth/approve/${pendingNurse._id}`)
      .set('Authorization', authHeader(adminB));

    expect(res).to.have.status(403);
    const saved = await User.findById(pendingNurse._id).lean();
    expect(saved.approvalStatus).to.equal('pending');
  });

  it('does not let a pending non-admin approve themselves or others', async () => {
    const { pendingNurse, otherPending } = await setup();

    for (const target of [pendingNurse, otherPending]) {
      const res = await chai.request(app)
        .patch(`/api/v1/auth/approve/${target._id}`)
        .set('Authorization', authHeader(pendingNurse));

      expect(res).to.have.status(403);
    }

    const saved = await User.find({ _id: { $in: [pendingNurse._id, otherPending._id] } }).lean();
    saved.forEach(user => expect(user.approvalStatus).to.equal('pending'));
  });

  it('blocks a deactivated admin who still holds a token', async () => {
    const { adminA, pendingNurse } = await setup();
    await User.updateOne({ _id: adminA._id }, { approvalStatus: 'deactivated' });

    const res = await chai.request(app)
      .patch(`/api/v1/auth/approve/${pendingNurse._id}`)
      .set('Authorization', authHeader(adminA));

    expect(res).to.have.status(403);
  });
});
