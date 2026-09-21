process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'gmproject';

const chai = require('chai');
const chaiHttp = require('chai-http');

const createTestApp = require('./helpers/testApp.cjs');
const { connectTestDb, clearTestDb, disconnectTestDb } = require('./helpers/db.cjs');
const { createCoreFixture, authHeader } = require('./helpers/fixtures.cjs');

chai.use(chaiHttp);
const { expect } = chai;
const app = createTestApp();

describe('rbac flow', function () {
  this.timeout(15000);

  before(connectTestDb);
  beforeEach(clearTestDb);
  after(disconnectTestDb);

  it('rejects protected admin routes when no bearer token is supplied', async () => {
    const res = await chai.request(app).get('/api/v1/admin/dashboard-summary');

    expect(res).to.have.status(401);
    expect(res.body.message).to.equal('Access denied. Invalid token format.');
  });

  it('rejects non-admin users from admin-only routes', async () => {
    const { nurse } = await createCoreFixture();

    const res = await chai
      .request(app)
      .get('/api/v1/admin/dashboard-summary')
      .set('Authorization', authHeader(nurse));

    expect(res).to.have.status(403);
    expect(res.body.message).to.equal('Access denied. Insufficient permissions.');
  });

  it('allows admin users to access admin-only routes', async () => {
    const { admin } = await createCoreFixture();

    const res = await chai
      .request(app)
      .get('/api/v1/admin/dashboard-summary')
      .set('Authorization', authHeader(admin));

    expect(res).to.have.status(200);
    expect(res.body).to.include.keys([
      'totalPatients',
      'totalActivePatients',
      'totalTasks',
      'completedTasks',
      'pendingTasks',
      'taskCompletionRate',
    ]);
    expect(res.body.totalStaff ?? res.body.staff?.total ?? 0).to.be.a('number');
  });
});
