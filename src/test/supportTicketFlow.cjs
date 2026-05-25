const chai = require('chai');
const chaiHttp = require('chai-http');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

chai.use(chaiHttp);

const { expect } = chai;

async function waitForAdminRole(Role) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const adminRole = await Role.findOne({ name: 'admin' });
    if (adminRole) return adminRole;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error('Timed out waiting for seeded admin role');
}

describe('Support ticket flow', function () {
  this.timeout(30000);

  let app;
  let mongoServer;
  let Role;
  let User;
  let SupportTicket;
  let Notification;
  let requester;
  let admin;
  let requesterToken;
  let adminToken;

  before(async function () {
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'support-ticket-test-secret';

    mongoServer = await MongoMemoryServer.create();
    process.env.MONGODB_URI = mongoServer.getUri('guardian-support-ticket-test');

    app = require('../server');
    await mongoose.connection.asPromise();

    Role = require('../models/Role');
    User = require('../models/User');
    SupportTicket = require('../models/SupportTicket');
    Notification = require('../models/Notification');

    const adminRole = await waitForAdminRole(Role);

    requester = await User.create({
      fullname: 'Support Requester',
      email: 'requester-support@example.com',
      password_hash: 'Password123!',
    });

    admin = await User.create({
      fullname: 'System Admin',
      email: 'admin-support@example.com',
      password_hash: 'Password123!',
      role: adminRole._id,
    });

    requesterToken = jwt.sign(
      { _id: requester._id, email: requester.email },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    adminToken = jwt.sign(
      { _id: admin._id, email: admin.email },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
  });

  after(async function () {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.dropDatabase();
      await mongoose.connection.close();
    }

    if (mongoServer) {
      await mongoServer.stop();
    }

    if (app?.server?.listening) {
      await new Promise((resolve) => app.server.close(resolve));
    }
  });

  it('supports creating, listing with pagination, and updating tickets', async function () {
    const createOneResponse = await chai
      .request(app)
      .post('/api/v1/admin/support-tickets')
      .set('Authorization', `Bearer ${requesterToken}`)
      .send({
        subject: 'Login issue',
        description: 'Unable to login from my tablet.',
        status: 'resolved',
      });

    expect(createOneResponse).to.have.status(201);
    expect(createOneResponse.body.ticket).to.include({
      subject: 'Login issue',
      description: 'Unable to login from my tablet.',
      status: 'open',
    });

    const createTwoResponse = await chai
      .request(app)
      .post('/api/v1/admin/support-tickets')
      .set('Authorization', `Bearer ${requesterToken}`)
      .send({
        subject: 'Medication reminder bug',
        description: 'Reminders are not appearing after noon.',
      });

    expect(createTwoResponse).to.have.status(201);

    const listResponse = await chai
      .request(app)
      .get(`/api/v1/admin/support-tickets?page=1&limit=1&userId=${requester._id}&status=open`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(listResponse).to.have.status(200);
    expect(listResponse.body).to.include({
      page: 1,
      limit: 1,
      total: 2,
      totalPages: 2,
    });
    expect(listResponse.body.tickets).to.have.lengthOf(1);

    const ticketId = createOneResponse.body.ticket._id;
    const updateResponse = await chai
      .request(app)
      .put(`/api/v1/admin/support-tickets/${ticketId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        status: 'resolved',
        adminResponse: 'The login issue was fixed by clearing the stale session.',
      });

    expect(updateResponse).to.have.status(200);
    expect(updateResponse.body.ticket).to.include({
      status: 'resolved',
      adminResponse: 'The login issue was fixed by clearing the stale session.',
    });

    const resolvedListResponse = await chai
      .request(app)
      .get(`/api/v1/admin/support-tickets?status=resolved&userId=${requester._id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(resolvedListResponse).to.have.status(200);
    expect(resolvedListResponse.body.total).to.equal(1);
    expect(resolvedListResponse.body.tickets[0]._id).to.equal(ticketId);

    const openApiResponse = await chai.request(app).get('/openapi.json');
    expect(openApiResponse).to.have.status(200);
    expect(openApiResponse.body.paths).to.have.property('/api/v1/admin/support-tickets');
    expect(openApiResponse.body.paths).to.have.property('/api/v1/admin/support-tickets/{ticketId}');

    const ticketsInDb = await SupportTicket.countDocuments({ user: requester._id });
    const notificationsInDb = await Notification.countDocuments({ userId: String(requester._id) });

    expect(ticketsInDb).to.equal(2);
    expect(notificationsInDb).to.be.greaterThan(0);
  });
});
