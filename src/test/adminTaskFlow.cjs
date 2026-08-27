process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'gmproject';

const chai = require('chai');
const chaiHttp = require('chai-http');

const createTestApp = require('./helpers/testApp.cjs');
const { connectTestDb, clearTestDb, disconnectTestDb } = require('./helpers/db.cjs');
const { createDashboardFixture, createOrganization, authHeader } = require('./helpers/fixtures.cjs');
const Task = require('../models/Task');

chai.use(chaiHttp);
const { expect } = chai;
const app = createTestApp();

async function linkDashboardFixtureToOrganization(fixture) {
  const organization = await createOrganization({
    name: `Admin Task Org ${fixture.admin._id}`,
    admin: fixture.admin,
  });

  await Promise.all(
    [fixture.admin, fixture.nurse, fixture.caretaker, fixture.doctor].map(async (user) => {
      user.organization = organization._id;
      await user.save();
    })
  );

  for (const patient of [fixture.activePatient, fixture.deletedPatient]) {
    patient.organization = organization._id;
    await patient.save();
  }

  return organization;
}

describe('admin task flow', function () {
  this.timeout(15000);

  before(connectTestDb);
  beforeEach(clearTestDb);
  after(disconnectTestDb);

  it('creates, updates and deletes a task through admin APIs', async () => {
    const fixture = await createDashboardFixture();
    await linkDashboardFixtureToOrganization(fixture);

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

  it('creates a task without a patient and keeps one assignee', async () => {
    const fixture = await createDashboardFixture();
    await linkDashboardFixtureToOrganization(fixture);

    const res = await chai
      .request(app)
      .post('/api/v1/admin/tasks')
      .set('Authorization', authHeader(fixture.admin))
      .send({
        description: 'Prepare the monthly staff summary',
        dueDate: '2026-06-15',
        assigneeId: String(fixture.nurse._id),
        relatedStaffIds: [String(fixture.doctor._id), String(fixture.caretaker._id)],
        objectives: ['Prepare the summary', 'Confirm the figures'],
        deliverables: ['Monthly staff summary'],
        priority: 'medium',
      });

    expect(res).to.have.status(201);
    expect(res.body.task.patient).to.equal(null);
    expect(res.body.task.assignee).to.equal(String(fixture.nurse._id));
    expect(res.body.task.relatedStaff).to.have.length(2);
    expect(res.body.task.objectives).to.deep.equal([
      'Prepare the summary',
      'Confirm the figures',
    ]);
    expect(res.body.task.deliverables).to.deep.equal(['Monthly staff summary']);
    expect(res.body.task.setBy).to.equal(String(fixture.admin._id));
    expect(new Date(res.body.task.created_at).toString()).not.to.equal('Invalid Date');
  });
});
