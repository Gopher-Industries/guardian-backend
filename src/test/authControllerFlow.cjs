process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'gmproject';

const chai = require('chai');
const jwt = require('jsonwebtoken');

const { connectTestDb, clearTestDb, disconnectTestDb } = require('./helpers/db.cjs');
const { seedRoles, createUser, DEFAULT_PASSWORD } = require('./helpers/fixtures.cjs');
const makeRes = require('./helpers/mockResponse.cjs');
const User = require('../models/User');

// Prevent password-reset tests from trying to send a real email.
const mailerPath = require.resolve('../utils/mailer');
const userControllerPath = require.resolve('../controllers/userController');

const originalMailer = require.cache[mailerPath];

let userController;

const { expect } = chai;

function makeRenderRes() {
  const res = makeRes();
  res.rendered = null;
  res.render = function render(view, payload) {
    this.rendered = { view, payload };
    return this;
  };
  return res;
}

describe('auth controller flow', function () {
  this.timeout(15000);
    before(() => {
    require.cache[mailerPath] = {
      id: mailerPath,
      filename: mailerPath,
      loaded: true,
      exports: {
        sendEmail: async () => true,
        sendPasswordResetEmail: async () => true,
        sendPinCodeVerificationEmail: async () => true,
      },
    };

    delete require.cache[userControllerPath];
    userController = require('../controllers/userController');
  });

  before(connectTestDb);
  beforeEach(async () => {
    await clearTestDb();
    await seedRoles();
  });
  after(disconnectTestDb);

  it('covers registration validation branches and no-role success path', async () => {
    let res = makeRes();
    await userController.registerUser({ body: {} }, res);
    expect(res.statusCode).to.equal(400);

    res = makeRes();
    await userController.registerUser({ body: { fullname: 'Bad Email', email: 'bad-email', password: DEFAULT_PASSWORD } }, res);
    expect(res.statusCode).to.equal(400);

    res = makeRes();
    await userController.registerUser({ body: { fullname: 'Short Password', email: 'short@example.com', password: '123' } }, res);
    expect(res.statusCode).to.equal(400);

    res = makeRes();
    await userController.registerUser({ body: { fullname: 'No Role User', email: 'norole@example.com', password: DEFAULT_PASSWORD } }, res);
    expect(res.statusCode).to.equal(201);
    expect(res.body.user.email).to.equal('norole@example.com');
  });

  it('covers login missing user, locked account and password-expiry reminder paths', async () => {
    let res = makeRes();
    await userController.login({ body: { email: 'missing@example.com', password: DEFAULT_PASSWORD } }, res);
    expect(res.statusCode).to.equal(400);

    const roles = await seedRoles();
    const locked = await createUser({
      fullname: 'Locked User',
      email: 'locked@example.com',
      role: roles.caretaker,
      password: DEFAULT_PASSWORD,
    });
    locked.failedLoginAttempts = 5;
    await locked.save();

    res = makeRes();
    await userController.login({ body: { email: locked.email, password: DEFAULT_PASSWORD } }, res);
    expect(res.statusCode).to.equal(400);

    const expiring = await createUser({
      fullname: 'Expiring User',
      email: 'expiring@example.com',
      role: roles.doctor,
      password: DEFAULT_PASSWORD,
    });
    expiring.lastPasswordChange = new Date(Date.now() - 88 * 24 * 60 * 60 * 1000);
    await expiring.save();

    res = makeRes();
    await userController.login({ body: { email: expiring.email, password: DEFAULT_PASSWORD } }, res);
    expect(res.statusCode).to.equal(200);
    expect(res.body.passwordExpiryReminder).to.be.a('string');
    expect(res.body.user.twoFactorRequired).to.equal(true);
  });

  it('covers temporary OTP bypass endpoints', async () => {
    let res = makeRes();
    await userController.sendOTP({ body: { email: 'anyone@example.com' } }, res);
    expect(res.statusCode).to.equal(200);

    res = makeRes();
    await userController.verifyOTP({ body: { email: 'anyone@example.com', otp: '123456' } }, res);
    expect(res.statusCode).to.equal(200);
  });

  it('covers change-password validation, wrong old password and success branches', async () => {
    const roles = await seedRoles();
    const user = await createUser({
      fullname: 'Password User',
      email: 'password-user@example.com',
      role: roles.nurse,
      password: DEFAULT_PASSWORD,
    });

    let res = makeRes();
    await userController.changePassword({ user: { _id: user._id }, body: {} }, res);
    expect(res.statusCode).to.equal(400);

    res = makeRes();
    await userController.changePassword({
      user: { _id: user._id },
      body: { oldPassword: DEFAULT_PASSWORD, newPassword: 'NewPassword123!', confirmPassword: 'Mismatch123!' },
    }, res);
    expect(res.statusCode).to.equal(400);

    res = makeRes();
    await userController.changePassword({
      user: { _id: user._id },
      body: { oldPassword: 'WrongPassword123!', newPassword: 'NewPassword123!', confirmPassword: 'NewPassword123!' },
    }, res);
    expect(res.statusCode).to.equal(400);

    res = makeRes();
    await userController.changePassword({
      user: { _id: user._id },
      body: { oldPassword: DEFAULT_PASSWORD, newPassword: 'NewPassword123!', confirmPassword: 'NewPassword123!' },
    }, res);
    expect(res.statusCode).to.equal(200);
  });

  it('covers password reset request, render and reset branches', async () => {
    const roles = await seedRoles();
    const user = await createUser({
      fullname: 'Reset User',
      email: 'reset-user@example.com',
      role: roles.admin,
      password: DEFAULT_PASSWORD,
    });

    let res = makeRes();
    await userController.requestPasswordReset({ body: {} }, res);
    expect(res.statusCode).to.equal(400);

    res = makeRes();
    await userController.requestPasswordReset({ body: { email: 'missing@example.com' } }, res);
    expect(res.statusCode).to.equal(404);

    res = makeRes();
    await userController.requestPasswordReset({ body: { email: user.email } }, res);
    expect(res.statusCode).to.equal(200);

    const token = jwt.sign({ _id: user._id }, process.env.JWT_SECRET, { expiresIn: '15m' });

    res = makeRenderRes();
    userController.renderPasswordResetPage({ query: { token } }, res);
    expect(res.rendered.view).to.equal('reset-password');

    res = makeRes();
    userController.renderPasswordResetPage({ query: { token: 'invalid-token' } }, res);
    expect(res.statusCode).to.equal(400);

    res = makeRes();
    await userController.resetPassword({ body: { token, newPassword: 'ResetPassword123!', confirmPassword: 'Mismatch123!' } }, res);
    expect(res.statusCode).to.equal(400);

    res = makeRes();
    await userController.resetPassword({ body: { token: 'bad-token', newPassword: 'ResetPassword123!', confirmPassword: 'ResetPassword123!' } }, res);
    expect(res.statusCode).to.equal(400);

    res = makeRes();
    await userController.resetPassword({ body: { token, newPassword: 'ResetPassword123!', confirmPassword: 'ResetPassword123!' } }, res);
    expect(res.statusCode).to.equal(200);

    const updated = await User.findById(user._id).lean();
    expect(updated.failedLoginAttempts).to.equal(0);
  });
});
