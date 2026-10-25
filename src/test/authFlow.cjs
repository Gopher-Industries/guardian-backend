process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'gmproject';

const chai = require('chai');
const chaiHttp = require('chai-http');
const bcrypt = require('bcryptjs');

const createTestApp = require('./helpers/testApp.cjs');
const { connectTestDb, clearTestDb, disconnectTestDb } = require('./helpers/db.cjs');
const { seedRoles, createUser, DEFAULT_PASSWORD } = require('./helpers/fixtures.cjs');
const User = require('../models/User');

chai.use(chaiHttp);
const { expect } = chai;
const app = createTestApp();

describe('auth flow', function () {
  this.timeout(15000);

  before(connectTestDb);
  beforeEach(clearTestDb);
  after(disconnectTestDb);

  it('registers a new user with a valid role and returns a JWT token', async () => {
    await seedRoles();

    const res = await chai
      .request(app)
      .post('/api/v1/auth/register')
      .send({
        fullname: 'Test Nurse',
        email: 'test-nurse@example.com',
        password: DEFAULT_PASSWORD,
        role: 'nurse',
      });

    expect(res).to.have.status(201);
    expect(res.body.message).to.equal('User registered successfully');
    expect(res.body.token).to.be.a('string');
    expect(res.body.user).to.include({
      fullname: 'Test Nurse',
      email: 'test-nurse@example.com',
      role: 'nurse',
    });

    const savedUser = await User.findOne({ email: 'test-nurse@example.com' });
    expect(savedUser).to.exist;
    expect(await bcrypt.compare(DEFAULT_PASSWORD, savedUser.password_hash)).to.equal(true);
  });

  it('rejects duplicate registration using the same email address', async () => {
    await seedRoles();

    const payload = {
      fullname: 'Duplicate User',
      email: 'duplicate@example.com',
      password: DEFAULT_PASSWORD,
      role: 'caretaker',
    };

    const first = await chai.request(app).post('/api/v1/auth/register').send(payload);
    const second = await chai.request(app).post('/api/v1/auth/register').send(payload);

    expect(first).to.have.status(201);
    expect(second).to.have.status(400);
    expect(second.body.error).to.equal('User already exists with this email');
  });

  it('rejects registration when the role does not exist', async () => {
    await seedRoles();

    const res = await chai
      .request(app)
      .post('/api/v1/auth/register')
      .send({
        fullname: 'Wrong Role User',
        email: 'wrong-role@example.com',
        password: DEFAULT_PASSWORD,
        role: 'manager',
      });

    expect(res).to.have.status(400);
    expect(res.body.error).to.equal('manager is an invalid role');
  });

  it('logs in an existing user and resets failed login attempts', async () => {
    const roles = await seedRoles();
    const nurse = await createUser({
      fullname: 'Login Nurse',
      email: 'login-nurse@example.com',
      role: roles.nurse,
      password: DEFAULT_PASSWORD,
      approvalStatus: 'approved',
    });

    nurse.failedLoginAttempts = 2;
    await nurse.save();

    const res = await chai
      .request(app)
      .post('/api/v1/auth/login')
      .send({ email: nurse.email, password: DEFAULT_PASSWORD });

    expect(res).to.have.status(200);
    expect(res.body.token).to.be.a('string');
    expect(res.body.user.email).to.equal(nurse.email);
    expect(res.body.user.role).to.equal('nurse');

    const updatedUser = await User.findById(nurse._id).lean();
    expect(updatedUser.failedLoginAttempts).to.equal(0);
  });

  it('increments failed login attempts when the password is wrong', async () => {
    const roles = await seedRoles();
    const caretaker = await createUser({
      fullname: 'Wrong Password User',
      email: 'wrong-password@example.com',
      role: roles.caretaker,
      password: DEFAULT_PASSWORD,
    });

    const res = await chai
      .request(app)
      .post('/api/v1/auth/login')
      .send({ email: caretaker.email, password: 'Incorrect123!' });

    expect(res).to.have.status(400);
    expect(res.body.error).to.equal('Incorrect email and password combination');

    const updatedUser = await User.findById(caretaker._id).lean();
    expect(updatedUser.failedLoginAttempts).to.equal(1);
  });
});
