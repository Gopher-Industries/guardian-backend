const chai = require('chai');
const chaiHttp = require('chai-http');
const fs = require('fs/promises');
const path = require('path');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

chai.use(chaiHttp);
const { expect } = chai;

async function waitForRole(Role, roleName) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const role = await Role.findOne({ name: roleName });
    if (role) return role;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for seeded ${roleName} role`);
}

describe('Daily operational PDF report', function () {
  this.timeout(30000);

  let app;
  let mongoServer;
  let User;
  let Patient;
  let Task;
  let Alert;
  let DailyOperationalReport;
  let admin;
  let generatedFile;

  before(async function () {
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'daily-report-test-secret';
    mongoServer = await MongoMemoryServer.create();
    process.env.MONGODB_URI = mongoServer.getUri('guardian-daily-report-test');

    delete require.cache[require.resolve('../server')];
    delete require.cache[require.resolve('../config/db')];
    app = require('../server');
    await mongoose.connection.asPromise();

    const Role = require('../models/Role');
    User = require('../models/User');
    Patient = require('../models/Patient');
    Task = require('../models/Task');
    Alert = require('../models/Alert');
    DailyOperationalReport = require('../models/DailyOperationalReport');
    const adminRole = await waitForRole(Role, 'admin');
    const caretakerRole = await waitForRole(Role, 'caretaker');

    admin = await User.create({
      fullname: 'Daily Report Admin', email: 'daily-report-admin@example.com',
      password_hash: 'Password123!', role: adminRole._id
    });
    const caretaker = await User.create({
      fullname: 'Daily Report Caretaker', email: 'daily-report-caretaker@example.com',
      password_hash: 'Password123!', role: caretakerRole._id
    });
    const patient = await Patient.create({
      fullname: 'Daily Report Patient', gender: 'F', dateOfBirth: new Date('1950-01-01'), caretaker: caretaker._id
    });
    await Task.create([
      { description: 'Completed daily check', dueDate: new Date('2026-09-18T09:00:00'), priority: 'medium', status: 'completed', patient: patient._id, caretaker: caretaker._id },
      { description: 'Urgent medication review', dueDate: new Date('2026-09-18T11:00:00'), priority: 'high', status: 'pending', patient: patient._id, caretaker: caretaker._id }
    ]);
    await Alert.create({ user_id: caretaker._id, alert_type: 'fall-risk', message: 'Patient needs a mobility check', created_at: new Date('2026-09-18T10:00:00') });
  });

  after(async function () {
    if (generatedFile) await fs.unlink(generatedFile).catch(() => {});
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.dropDatabase();
      await mongoose.connection.close();
    }
    if (mongoServer) await mongoServer.stop();
    if (app?.server?.listening) await new Promise((resolve) => app.server.close(resolve));
  });

  it('uses database metrics, generates a PDF, and signs it with the authenticated user', async function () {
    const token = jwt.sign({ _id: admin._id, email: admin.email }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const response = await chai.request(app)
      .post('/api/v1/admin/daily-reports/pdf')
      .set('Authorization', `Bearer ${token}`)
      .send({
        reportDate: '2026-09-18',
        generalNotes: 'Morning medication round completed.',
        analytics: 'One urgent review remains open.',
        signoffName: 'This supplied value must be ignored.'
      });

    expect(response).to.have.status(201);
    expect(response.body.report.signoff).to.deep.equal({ userId: String(admin._id), name: 'Daily Report Admin' });
    expect(response.body.report.metrics.totalTasks).to.equal(2);
    expect(response.body.report.metrics.completedTasks).to.equal(1);
    expect(response.body.report.metrics.taskCompletionRate).to.equal(50);
    expect(response.body.report.metrics.urgentTasks).to.have.lengthOf(1);
    expect(response.body.report.metrics.riskDistribution).to.deep.equal({ 'fall-risk': 1 });
    expect(response.body.report.metrics.bookedAppointments).to.include({ value: 0, tracked: false });

    generatedFile = path.join(process.cwd(), response.body.report.filePath.replace(/^\//, '').replace(/\//g, path.sep));
    const pdf = await fs.readFile(generatedFile);
    expect(pdf.subarray(0, 8).toString()).to.equal('%PDF-1.4');
    expect(await DailyOperationalReport.countDocuments()).to.equal(1);
  });
});
