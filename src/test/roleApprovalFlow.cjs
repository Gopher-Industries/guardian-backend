process.env.NODE_ENV = 'test';

const assert = require('node:assert/strict');
const express = require('express');
const mongoose = require('mongoose');
const chai = require('chai');
const chaiHttp = require('chai-http');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { seedRoles, createUser, createOrganization, authHeader } =
  require('./helpers/fixtures.cjs');
const User = require('../models/User');
const verifyRole = require('../middleware/verifyRole');
const authRouter = require('../routes/user');
const userController = require('../controllers/userController');
const { buildSwaggerSpec } = require('../config/swagger');

chai.use(chaiHttp);

describe('Role and approval authorisation', function () {
  this.timeout(120000);

  const app = express();
  app.use(express.json());
  app.use('/api/v1/auth', authRouter);

  let mongo;
  let admin;
  let nurse;
  let noRole;
  let ownTarget;
  let otherTarget;
  let unlinkedTarget;
  let positiveTarget;
  let inactiveTarget;
  let staffScopeTarget;
  let concurrentTarget;
  let movedTarget;
  let outsideOrgId;
  let beforeApproval;
  let approvalLayer;
  let originalHandler;
  let approvalCalls = 0;
  const missingId = new mongoose.Types.ObjectId();

  before(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    const roles = await seedRoles();

    const makeUser = (name, fields) => createUser({
      fullname: name,
      email: name + '@example.test',
      ...fields
    });

    admin = await makeUser('admin-a', { role: roles.admin, approvalStatus: 'approved' });
    const otherAdmin = await makeUser('admin-b', { role: roles.admin, approvalStatus: 'approved' });
    const orgA = await createOrganization({ name: 'Org A', admin });
    const orgB = await createOrganization({ name: 'Org B', admin: otherAdmin });
    outsideOrgId = orgB._id;
    // Exercise creator authority without an overlapping staff relationship.
    await orgA.updateOne({ $set: { staff: [] } });

    const staffOrg = await createOrganization({ name: 'Staff Org', admin: otherAdmin });
    await staffOrg.updateOne({ $addToSet: { staff: admin._id } });
    const inactiveOrg = await createOrganization({ name: 'Inactive Org', admin });
    await inactiveOrg.updateOne({ $set: { active: false } });

    inactiveTarget = await makeUser('inactive-target', {
      role: roles.nurse, organization: inactiveOrg._id
    });
    staffScopeTarget = await makeUser('staff-scope-target', {
      role: roles.nurse, organization: staffOrg._id
    });
    concurrentTarget = await makeUser('concurrent-target', {
      role: roles.nurse, organization: orgA._id
    });
    movedTarget = await makeUser('moved-target', {
      role: roles.nurse, organization: orgA._id
    });
    nurse = await makeUser('nurse-a', {
      role: roles.nurse, organization: orgA._id, approvalStatus: 'approved'
    });
    noRole = await makeUser('no-role', {});
    ownTarget = await makeUser('target-a', { role: roles.nurse, organization: orgA._id });
    otherTarget = await makeUser('target-b', { role: roles.nurse, organization: orgB._id });
    unlinkedTarget = await makeUser('unlinked', { role: roles.nurse });

    positiveTarget = await makeUser('positive-target', {
      role: roles.nurse, organization: orgA._id
    });

    const approvalRoute = authRouter.stack.find(layer =>
      layer.route?.path === '/approve/:userId' && layer.route.methods.patch
    );
    approvalLayer = approvalRoute.route.stack.find(layer =>
      layer.handle === userController.approveUser
    );
    originalHandler = approvalLayer.handle;
    approvalLayer.handle = function (req, res, next) {
      approvalCalls++;
      if (beforeApproval) {
        return Promise.resolve()
          .then(() => beforeApproval())
          .then(() => originalHandler(req, res, next))
          .catch(next);
      }
      return originalHandler(req, res, next);
    };
  });

  after(async () => {
    if (approvalLayer) approvalLayer.handle = originalHandler;
    try {
      await mongoose.disconnect();
    } finally {
      if (mongo) await mongo.stop();
    }
  });

  async function checkRole(roles, user) {
    const req = { user };
    let status;
    let passed = false;
    const res = {
      status(code) { status = code; return this; },
      json() {}
    };
    await verifyRole(roles)(req, res, () => { passed = true; });
    return { status, passed, role: req.userRole };
  }

  it('supports a string and an array with case-insensitive matching', async () => {
    const identity = { _id: admin._id };
    for (const roles of ['ADMIN', ['nurse', 'AdMiN']]) {
      assert.deepEqual(await checkRole(roles, identity), {
        status: undefined, passed: true, role: 'admin'
      });
    }
  });

  it('documents the approval response statuses', () => {
    const spec = buildSwaggerSpec();
    const approval = spec.paths['/api/v1/auth/approve/{userId}'].patch;
    for (const status of ['200', '400', '401', '403', '404', '500']) {
      assert.ok(approval.responses[status], 'Missing response ' + status);
    }
  });

  it('denies a direct controller invocation without a verified scope', async () => {
    let status;
    const res = {
      status(code) { status = code; return this; },
      json() {}
    };
    await userController.approveUser({}, res);
    assert.equal(status, 403);
  });

  it('rejects missing identity before any user query', async () => {
    const original = User.findById;
    let queries = 0;
    User.findById = function (...args) {
      queries++;
      return original.apply(this, args);
    };
    try {
      for (const identity of [undefined, {}]) {
        const result = await checkRole('admin', identity);
        assert.equal(result.status, 401);
        assert.equal(result.passed, false);
      }
      assert.equal(queries, 0);
    } finally {
      User.findById = original;
    }
  });

  it('rejects missing users, missing roles and database role mismatches', async () => {
    for (const identity of [
      { _id: missingId },
      { _id: noRole._id },
      { _id: nurse._id, role: 'admin' }
    ]) {
      const result = await checkRole('admin', identity);
      assert.equal(result.status, 403);
      assert.equal(result.passed, false);
    }
  });

  function approve(id, actor) {
    const request = chai.request(app).patch('/api/v1/auth/approve/' + id);
    return actor ? request.set('Authorization', authHeader(actor)) : request;
  }

  const rejected = [
    ['unauthenticated', () => ownTarget._id, () => null, 401],
    ['non-administrator', () => ownTarget._id, () => nurse, 403],
    ['cross-organisation', () => otherTarget._id, () => admin, 403],
    ['unlinked account', () => unlinkedTarget._id, () => admin, 403],
    ['inactive organisation', () => inactiveTarget._id, () => admin, 403],
    ['invalid target ID', () => 'invalid-id', () => admin, 400],
    ['missing target', () => missingId, () => admin, 404]
  ];

  for (const [label, target, actor, status] of rejected) {
    it('blocks ' + label + ' before the approval controller', async () => {
      const previousCalls = approvalCalls;
      const response = await approve(target(), actor());
      assert.equal(response.status, status);
      assert.equal(approvalCalls, previousCalls);

      const protectedIds = [
        ownTarget._id, otherTarget._id, unlinkedTarget._id, inactiveTarget._id
      ];
      const users = await User.find({ _id: { $in: protectedIds } });
      assert.equal(users.length, protectedIds.length);
      for (const user of users) {
        assert.equal(user.approvalStatus, 'pending');
        assert.equal(user.approvedBy, null);
        assert.equal(user.approvedAt, null);
      }
    });
  }

  it('approves a pending user in scope and preserves the first approval', async () => {
    const previousCalls = approvalCalls;
    const response = await approve(positiveTarget._id, admin);
    assert.equal(response.status, 200);
    assert.equal(approvalCalls, previousCalls + 1);
    assert.equal(response.body.user.approvalStatus, 'approved');
    assert.equal(response.body.user.approvedBy, String(admin._id));

    const saved = await User.findById(positiveTarget._id);
    assert.equal(saved.approvalStatus, 'approved');
    assert.equal(String(saved.approvedBy), String(admin._id));
    assert.ok(saved.approvedAt instanceof Date);

    const repeated = await approve(positiveTarget._id, admin);
    assert.equal(repeated.status, 400);
    const afterRepeat = await User.findById(positiveTarget._id);
    assert.equal(afterRepeat.approvedAt.getTime(), saved.approvedAt.getTime());
  });

  it('authorises an administrator linked through staff in a second organisation', async () => {
    const response = await approve(staffScopeTarget._id, admin);
    assert.equal(response.status, 200);
    assert.equal(response.body.user.approvedBy, String(admin._id));
  });

  it('grants only one approval when two requests run concurrently', async () => {
    const responses = await Promise.all([
      approve(concurrentTarget._id, admin),
      approve(concurrentTarget._id, admin)
    ]);
    assert.deepEqual(responses.map(response => response.status).sort(), [200, 400]);
    const success = responses.find(response => response.status === 200);
    const saved = await User.findById(concurrentTarget._id);
    assert.equal(saved.approvalStatus, 'approved');
    assert.equal(String(saved.approvedBy), String(admin._id));
    assert.equal(saved.approvedAt.toISOString(), success.body.user.approvedAt);
  });

  it('does not write after the target moves out of scope', async () => {
    beforeApproval = () => User.updateOne(
      { _id: movedTarget._id },
      { $set: { organization: outsideOrgId } }
    );
    try {
      const response = await approve(movedTarget._id, admin);
      assert.equal(response.status, 404);
      const saved = await User.findById(movedTarget._id);
      assert.equal(String(saved.organization), String(outsideOrgId));
      assert.equal(saved.approvalStatus, 'pending');
      assert.equal(saved.approvedBy, null);
      assert.equal(saved.approvedAt, null);
    } finally {
      beforeApproval = undefined;
    }
  });
});