process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'gmproject';

const chai = require('chai');
const chaiHttp = require('chai-http');
const jwt = require('jsonwebtoken');

const { connectTestDb, clearTestDb, disconnectTestDb } = require('./helpers/db.cjs');
const { seedRoles, createUser, authHeader, DEFAULT_PASSWORD } = require('./helpers/fixtures.cjs');
const { OTP } = require('../models/otp');

chai.use(chaiHttp);
const { expect } = chai;

// Capture PIN and reset emails instead of sending them.
const mailerPath = require.resolve('../utils/mailer');
const sent = [];
let app;

function loadApp() {
  require.cache[mailerPath] = {
    id: mailerPath,
    filename: mailerPath,
    loaded: true,
    exports: {
      sendEmail: async () => true,
      sendPasswordResetEmail: async (to, name, token) => { sent.push({ type: 'reset', to, token }); },
      sendPinCodeVerificationEmail: async (to, name, otp) => { sent.push({ type: 'otp', to, otp }); },
    },
  };
  ['../controllers/userController', '../routes/user', './helpers/testApp.cjs'].forEach((m) => {
    delete require.cache[require.resolve(m)];
  });
  return require('./helpers/testApp.cjs')();
}

const lastPin = (email) => [...sent].reverse().find(m => m.type === 'otp' && m.to === email)?.otp;

describe('account protection', function () {
  this.timeout(20000);

  before(() => { app = loadApp(); });
  before(connectTestDb);
  beforeEach(async () => {
    sent.length = 0;
    delete process.env.TWO_FACTOR_ENFORCED;
    await clearTestDb();
  });
  after(() => {
    delete process.env.TWO_FACTOR_ENFORCED;
    delete require.cache[mailerPath];
  });
  after(disconnectTestDb);

  async function makeDoctor() {
    const roles = await seedRoles();
    return createUser({
      fullname: 'Doc Two', email: 'doc@test.local', role: roles.doctor,
      password: DEFAULT_PASSWORD, approvalStatus: 'approved',
    });
  }

  const login = (email, password = DEFAULT_PASSWORD) =>
    chai.request(app).post('/api/v1/auth/login').send({ email, password });

  describe('account enumeration', () => {
    it('gives the same login error for an unknown email and a wrong password', async () => {
      const doctor = await makeDoctor();

      const unknown = await login('nobody@test.local');
      const wrong = await login(doctor.email, 'Wrong123!');

      expect(unknown).to.have.status(400);
      expect(wrong).to.have.status(400);
      expect(unknown.body.error).to.equal(wrong.body.error);
    });

    it('gives the same reset reply for known and unknown emails', async () => {
      const doctor = await makeDoctor();

      const known = await chai.request(app).post('/api/v1/auth/reset-password-request').send({ email: doctor.email });
      const unknown = await chai.request(app).post('/api/v1/auth/reset-password-request').send({ email: 'nobody@test.local' });

      expect(known).to.have.status(200);
      expect(unknown).to.have.status(200);
      expect(known.body).to.deep.equal(unknown.body);
      expect(sent.filter(m => m.type === 'reset')).to.have.length(1);
    });

    it('gives the same send-pin reply for known and unknown emails', async () => {
      const doctor = await makeDoctor();

      const known = await chai.request(app).post('/api/v1/auth/send-pin').send({ email: doctor.email });
      const unknown = await chai.request(app).post('/api/v1/auth/send-pin').send({ email: 'nobody@test.local' });

      expect(known.body).to.deep.equal(unknown.body);
      expect(sent.filter(m => m.type === 'otp')).to.have.length(1);
    });
  });

  describe('PIN codes', () => {
    it('accepts the right PIN once and stores only a hash', async () => {
      const doctor = await makeDoctor();
      await chai.request(app).post('/api/v1/auth/send-pin').send({ email: doctor.email });
      const pin = lastPin(doctor.email);

      expect(pin).to.match(/^\d{6}$/);
      const record = await OTP.findOne({ email: doctor.email }).lean();
      expect(record).to.not.have.property('otp');
      expect(record.otpHash).to.not.equal(pin);

      const ok = await chai.request(app).post('/api/v1/auth/verify-pin').send({ email: doctor.email, otp: pin });
      expect(ok).to.have.status(200);
      expect(ok.body).to.not.have.property('token');

      const again = await chai.request(app).post('/api/v1/auth/verify-pin').send({ email: doctor.email, otp: pin });
      expect(again).to.have.status(400);
    });

    it('throws the PIN away after 5 wrong guesses', async () => {
      const doctor = await makeDoctor();
      await chai.request(app).post('/api/v1/auth/send-pin').send({ email: doctor.email });
      const pin = lastPin(doctor.email);
      const wrongPin = pin === '111111' ? '222222' : '111111';

      for (let i = 0; i < 5; i += 1) {
        const res = await chai.request(app).post('/api/v1/auth/verify-pin').send({ email: doctor.email, otp: wrongPin });
        expect(res).to.have.status(400);
      }

      const right = await chai.request(app).post('/api/v1/auth/verify-pin').send({ email: doctor.email, otp: pin });
      expect(right).to.have.status(400);
    });
  });

  describe('two-factor login (TWO_FACTOR_ENFORCED=true)', () => {
    it('keeps the old one-step login while the setting is off', async () => {
      const doctor = await makeDoctor();

      const res = await login(doctor.email);

      expect(res).to.have.status(200);
      expect(res.body.token).to.be.a('string');
    });

    it('needs password and PIN before giving an access token', async () => {
      process.env.TWO_FACTOR_ENFORCED = 'true';
      const doctor = await makeDoctor();

      const step1 = await login(doctor.email);
      expect(step1).to.have.status(200);
      expect(step1.body.twoFactorRequired).to.equal(true);
      expect(step1.body).to.not.have.property('token');

      // The challenge token can't be used to call the API.
      const misuse = await chai.request(app).get('/api/v1/auth/search-user')
        .query({ search: 'Doc' }).set('Authorization', `Bearer ${step1.body.challengeToken}`);
      expect(misuse).to.have.status(401);

      const step2 = await chai.request(app).post('/api/v1/auth/verify-pin').send({
        email: doctor.email, otp: lastPin(doctor.email), challengeToken: step1.body.challengeToken,
      });
      expect(step2).to.have.status(200);
      expect(step2.body.token).to.be.a('string');
      expect(step2.body.user.role).to.equal('doctor');
    });

    it('does not let a challenge token for one user finish login as another', async () => {
      process.env.TWO_FACTOR_ENFORCED = 'true';
      const doctor = await makeDoctor();
      const roles = await seedRoles();
      const other = await createUser({
        fullname: 'Other Doc', email: 'other@test.local', role: roles.doctor,
        password: DEFAULT_PASSWORD, approvalStatus: 'approved',
      });

      const step1 = await login(doctor.email);
      await chai.request(app).post('/api/v1/auth/send-pin').send({ email: other.email });

      const res = await chai.request(app).post('/api/v1/auth/verify-pin').send({
        email: other.email, otp: lastPin(other.email), challengeToken: step1.body.challengeToken,
      });
      expect(res).to.have.status(401);
      expect(res.body).to.not.have.property('token');
    });

    it('still lets nurses sign in with one step', async () => {
      process.env.TWO_FACTOR_ENFORCED = 'true';
      const roles = await seedRoles();
      const nurse = await createUser({
        fullname: 'Nurse One', email: 'nurse@test.local', role: roles.nurse,
        password: DEFAULT_PASSWORD, approvalStatus: 'approved',
      });

      const res = await login(nurse.email);
      expect(res).to.have.status(200);
      expect(res.body.token).to.be.a('string');
    });
  });

  describe('token separation', () => {
    it('does not accept a login token on the reset-password endpoint', async () => {
      const doctor = await makeDoctor();
      const loginToken = authHeader(doctor).slice('Bearer '.length);

      const res = await chai.request(app).post('/api/v1/auth/reset-password').send({
        token: loginToken, newPassword: 'Hijack123!', confirmPassword: 'Hijack123!',
      });

      expect(res).to.have.status(400);
      const stillOld = await login(doctor.email);
      expect(stillOld).to.have.status(200);
    });

    it('does not accept a password-reset token as an access token', async () => {
      const doctor = await makeDoctor();
      const resetToken = jwt.sign({ _id: doctor._id, purpose: 'password-reset' }, process.env.JWT_SECRET, { expiresIn: '15m' });

      const res = await chai.request(app).get('/api/v1/auth/search-user')
        .query({ search: 'Doc' }).set('Authorization', `Bearer ${resetToken}`);

      expect(res).to.have.status(401);
    });

    it('still resets the password with a real reset token', async () => {
      const doctor = await makeDoctor();
      await chai.request(app).post('/api/v1/auth/reset-password-request').send({ email: doctor.email });
      const { token } = sent.find(m => m.type === 'reset');

      const res = await chai.request(app).post('/api/v1/auth/reset-password').send({
        token, newPassword: 'BrandNew123!', confirmPassword: 'BrandNew123!',
      });

      expect(res).to.have.status(200);
      expect(await login(doctor.email, 'BrandNew123!')).to.have.status(200);
    });
  });
});
