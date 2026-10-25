process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'gmproject';

const chai = require('chai');
const chaiHttp = require('chai-http');

const createTestApp = require('./helpers/testApp.cjs');
const { connectTestDb, clearTestDb, disconnectTestDb } = require('./helpers/db.cjs');
const { seedRoles, createUser, authHeader } = require('./helpers/fixtures.cjs');
const Notification = require('../models/Notification');

chai.use(chaiHttp);
const { expect } = chai;
const app = createTestApp();

describe('notification flow', function () {
  this.timeout(15000);

  before(connectTestDb);
  beforeEach(clearTestDb);
  after(disconnectTestDb);

  it('creates and fetches notifications for the authenticated user', async () => {
    const roles = await seedRoles();
    const nurse = await createUser({
      fullname: 'Notification Nurse',
      email: 'notification-nurse@example.com',
      role: roles.nurse,
    });

    const createRes = await chai
      .request(app)
      .post('/api/v1/notifications')
      .set('Authorization', authHeader(nurse))
      .send({
        userId: String(nurse._id),
        title: 'New Alert',
        message: 'A patient alert has been assigned to you.',
      });

    expect(createRes).to.have.status(201);
    expect(createRes.body.title).to.equal('New Alert');
    expect(createRes.body.message).to.equal('A patient alert has been assigned to you.');
    expect(createRes.body.isRead).to.equal(false);

    const listRes = await chai
      .request(app)
      .get('/api/v1/notifications')
      .set('Authorization', authHeader(nurse));

    expect(listRes).to.have.status(200);
    expect(listRes.body).to.have.length(1);
    expect(listRes.body[0].title).to.equal('New Alert');
  });

  it('marks only the authenticated user notification as read', async () => {
    const roles = await seedRoles();
    const caretaker = await createUser({
      fullname: 'Notification Caretaker',
      email: 'notification-caretaker@example.com',
      role: roles.caretaker,
    });

    const notification = await Notification.create({
      userId: String(caretaker._id),
      title: 'Care task',
      message: 'Please check the latest task.',
    });

    const res = await chai
      .request(app)
      .patch(`/api/v1/notifications/${notification._id}/read`)
      .set('Authorization', authHeader(caretaker));

    expect(res).to.have.status(200);
    expect(res.body.isRead).to.equal(true);

    const updated = await Notification.findById(notification._id).lean();
    expect(updated.isRead).to.equal(true);
  });

  it('does not expose another user notification through update or delete routes', async () => {
    const roles = await seedRoles();
    const nurse = await createUser({
      fullname: 'Private Nurse',
      email: 'private-nurse@example.com',
      role: roles.nurse,
    });
    const caretaker = await createUser({
      fullname: 'Private Caretaker',
      email: 'private-caretaker@example.com',
      role: roles.caretaker,
    });

    const otherNotification = await Notification.create({
      userId: String(caretaker._id),
      title: 'Private message',
      message: 'This should not be visible to the nurse.',
    });

    const readRes = await chai
      .request(app)
      .patch(`/api/v1/notifications/${otherNotification._id}/read`)
      .set('Authorization', authHeader(nurse));

    const deleteRes = await chai
      .request(app)
      .delete(`/api/v1/notifications/${otherNotification._id}`)
      .set('Authorization', authHeader(nurse));

    expect(readRes).to.have.status(404);
    expect(deleteRes).to.have.status(404);

    const stillExists = await Notification.findById(otherNotification._id).lean();
    expect(stillExists).to.exist;
    expect(stillExists.isRead).to.equal(false);
  });

  it('rejects notification creation when required fields are missing', async () => {
    const roles = await seedRoles();
    const admin = await createUser({
      fullname: 'Notification Admin',
      email: 'notification-admin@example.com',
      role: roles.admin,
    });

    const res = await chai
      .request(app)
      .post('/api/v1/notifications')
      .set('Authorization', authHeader(admin))
      .send({ userId: String(admin._id), title: 'Missing message' });

    expect(res).to.have.status(400);
    expect(res.body.message).to.equal('userId, title and message are required.');
  });
});
