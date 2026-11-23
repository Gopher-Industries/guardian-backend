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

describe('user directory scope', function () {
  this.timeout(20000);

  before(connectTestDb);
  beforeEach(clearTestDb);
  after(disconnectTestDb);

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
        fullname: `Shared Name ${tag}`, email: `nurse-${tag}@test.local`, role: roles.nurse,
        organization: org._id, approvalStatus: 'approved',
      });
      await User.updateOne({ _id: nurse._id }, { taxFileNumber: '123456789', bsb: '000000' });
      return { admin, org, nurse };
    };
    const loner = await createUser({
      fullname: 'Shared Name Loner', email: 'loner@test.local', role: roles.caretaker, approvalStatus: 'pending',
    });
    return { roles, a: await make('a'), b: await make('b'), loner };
  }

  describe('GET /api/v1/auth', () => {
    it('lets an admin list only users in their organization, without private fields', async () => {
      const { a } = await setup();

      const res = await chai.request(app).get('/api/v1/auth').set('Authorization', authHeader(a.admin));

      expect(res).to.have.status(200);
      const emails = res.body.map(u => u.email).sort();
      expect(emails).to.deep.equal(['admin-a@test.local', 'nurse-a@test.local']);
      res.body.forEach((u) => {
        expect(u).to.not.have.property('password_hash');
        expect(u).to.not.have.property('taxFileNumber');
        expect(u).to.not.have.property('bsb');
      });
    });

    it('blocks non-admins', async () => {
      const { a, loner } = await setup();

      for (const user of [a.nurse, loner]) {
        const res = await chai.request(app).get('/api/v1/auth').set('Authorization', authHeader(user));
        expect(res).to.have.status(403);
      }
    });
  });

  describe('GET /api/v1/auth/search-user', () => {
    it('only finds people in the caller organization', async () => {
      const { a } = await setup();

      const res = await chai.request(app)
        .get('/api/v1/auth/search-user')
        .query({ search: 'Shared Name' })
        .set('Authorization', authHeader(a.nurse));

      expect(res).to.have.status(200);
      expect(res.body.users.map(u => u.fullname)).to.deep.equal(['Shared Name a']);
    });

    it('does not find a user from another organization by id', async () => {
      const { a, b } = await setup();

      const res = await chai.request(app)
        .get('/api/v1/auth/search-user')
        .query({ search: String(b.nurse._id) })
        .set('Authorization', authHeader(a.nurse));

      expect(res).to.have.status(404);
    });

    it('finds nobody for a user with no organization', async () => {
      const { loner } = await setup();

      const res = await chai.request(app)
        .get('/api/v1/auth/search-user')
        .query({ search: 'Shared Name' })
        .set('Authorization', authHeader(loner));

      expect(res).to.have.status(404);
    });
  });
});
