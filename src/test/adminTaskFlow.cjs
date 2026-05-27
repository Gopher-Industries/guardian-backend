process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'gmproject';

const chai = require('chai');
const chaiHttp = require('chai-http');

const createTestApp = require('./helpers/testApp.cjs');
const { connectTestDb, clearTestDb, disconnectTestDb } = require('./helpers/db.cjs');
const { createDashboardFixture, authHeader } = require('./helpers/fixtures.cjs');
const Task = require('../models/Task');

chai.use(chaiHttp);
const { expect } = chai;
const app = createTestApp();

describe('admin task flow', function () {
  this.timeout(15000);

  before(connectTestDb);
  beforeEach(clearTestDb);
  after(disconnectTestDb);

  it('creates, updates and deletes a task through admin APIs', async () => {
    const fixture = await createDashboardFixture();

    const createRes = await chai
      .request(app)
      .post('/api/v1/admin/tasks')
      .set('Authorization', authHeader(fixture.admin))
      .send({
        description: 'Admin-created integration task',
        patientId: String(fixture.activePatient._id),
        dueDate: '2026-06-10',
        caretakerId: String(fixture.caretaker._id),
        nurseId: String(fixture.nurse._id),
        priority: 'high',
      });

    expect(createRes).to.have.status(201);
    expect(createRes.body.message).to.equal('Task created successfully');
    expect(createRes.body.task.description).to.equal('Admin-created integration task');

    const taskId = createRes.body.task._id;

    const updateRes = await chai
      .request(app)
      .put(`/api/v1/admin/tasks/${taskId}`)
      .set('Authorization', authHeader(fixture.admin))
      .send({
        status: 'completed',
        report: 'Task completed during integration test.',
      });

    expect(updateRes).to.have.status(200);
    expect(updateRes.body.message).to.equal('Task updated successfully');
    expect(updateRes.body.task.status).to.equal('completed');
    expect(updateRes.body.task.report).to.equal('Task completed during integration test.');

    const deleteRes = await chai
      .request(app)
      .delete(`/api/v1/admin/tasks/${taskId}`)
      .set('Authorization', authHeader(fixture.admin));

    expect(deleteRes).to.have.status(200);
    expect(deleteRes.body.message).to.equal('Task deleted successfully');

    const deletedTask = await Task.findById(taskId).lean();
    expect(deletedTask).to.equal(null);
  });

  it('returns 404 when updating a task that does not exist', async () => {
    const fixture = await createDashboardFixture();
    const missingTaskId = '64b000000000000000000001';

    const res = await chai
      .request(app)
      .put(`/api/v1/admin/tasks/${missingTaskId}`)
      .set('Authorization', authHeader(fixture.admin))
      .send({ status: 'completed' });

    expect(res).to.have.status(404);
    expect(res.body.message).to.equal('Task not found');
  });
});
