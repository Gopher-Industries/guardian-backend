/**
 * Guardian Email Service — emailRoutesFlow.cjs
 *
 * Integration tests that exercise the /api/v1/email endpoints through the real router, auth middleware and database.
 *
 * Author: Graeme Thomas
 * Date:   2026-08-08
 */

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'gmproject';

// Nothing may leave the process during these tests.
process.env.EMAIL_PROVIDER = 'dryrun';
process.env.EMAIL_DRY_RUN = 'true';
process.env.EMAIL_FROM = 'no-reply@guardian.test';
process.env.EMAIL_SENDER_NAME = 'Guardian Monitor';
process.env.APP_NAME = 'Guardian Monitor';
process.env.APP_URL = 'https://guardian.test';
process.env.BASE_URL = 'https://guardian.test';
process.env.EMAIL_ALLOWLIST = '';
process.env.EMAIL_ALLOWLIST_ENFORCE = 'false';

const chai = require('chai');
const chaiHttp = require('chai-http');

const createTestApp = require('./helpers/testApp.cjs');
const { connectTestDb, clearTestDb, disconnectTestDb } = require('./helpers/db.cjs');
const { seedRoles, createUser, authHeader } = require('./helpers/fixtures.cjs');

const outbox = require('../services/emailOutbox');
const providers = require('../providers');

chai.use(chaiHttp);
const { expect } = chai;
const app = createTestApp();

/**
 * Route-level coverage for /api/v1/email, plus the part that matters most:
 * asserting that real application flows actually produce the right email.
 *
 * Requires MongoDB, the same as the other *Flow.cjs suites:
 *   docker compose up -d mongo
 */
describe('email routes and side effects', function () {
  this.timeout(20000);

  let admin;
  let nurse;

  before(connectTestDb);
  after(disconnectTestDb);

  beforeEach(async () => {
    await clearTestDb();
    outbox.clear();

    const roles = await seedRoles();

    admin = await createUser({
      fullname: 'Email Admin',
      email: 'email-admin@guardian.test',
      role: roles.admin,
      approvalStatus: 'approved'
    });

    nurse = await createUser({
      fullname: 'Nadia Nurse',
      email: 'email-nurse@guardian.test',
      role: roles.nurse,
      approvalStatus: 'approved'
    });

  });

  /* ------------------------------------------------------------------ */
  describe('access control', () => {
    it('rejects an unauthenticated request', async () => {
      const res = await chai.request(app).get('/api/v1/email/templates');
      expect(res).to.have.status(401);
    });

    it('rejects a non-admin user', async () => {
      const res = await chai
        .request(app)
        .get('/api/v1/email/templates')
        .set('Authorization', authHeader(nurse));

      expect(res).to.have.status(403);
    });

    it('allows an admin user', async () => {
      const res = await chai
        .request(app)
        .get('/api/v1/email/templates')
        .set('Authorization', authHeader(admin));

      expect(res).to.have.status(200);
      expect(res.body.count).to.be.greaterThan(0);
      expect(res.body.templates[0]).to.include.keys('key', 'fields');
    });

    it('does not leak API keys through the config endpoint', async () => {
      const res = await chai
        .request(app)
        .get('/api/v1/email/config')
        .set('Authorization', authHeader(admin));

      expect(res).to.have.status(200);
      expect(res.body.provider).to.equal('dryrun');
      expect(JSON.stringify(res.body)).to.not.match(/[A-Za-z0-9_-]{32,}/);
    });
  });

  /* ------------------------------------------------------------------ */
  describe('preview', () => {
    it('renders a template as JSON without sending', async () => {
      const res = await chai
        .request(app)
        .post('/api/v1/email/preview')
        .set('Authorization', authHeader(admin))
        .send({
          template: 'patient-alert',
          data: {
            to: 'carer@guardian.test',
            patientName: 'Margaret Doyle',
            alertType: 'Fall detected',
            severity: 'critical'
          }
        });

      expect(res).to.have.status(200);
      expect(res.body.subject).to.contain('CRITICAL');
      expect(res.body.html).to.contain('Margaret Doyle');
      expect(outbox.size()).to.equal(0, 'preview must not touch the outbox');
    });

    it('returns a raw HTML document when format is html', async () => {
      const res = await chai
        .request(app)
        .post('/api/v1/email/preview')
        .set('Authorization', authHeader(admin))
        .send({ template: 'welcome', data: { to: 'a@guardian.test', name: 'Alex' }, format: 'html' });

      expect(res).to.have.status(200);
      expect(res).to.have.header('content-type', /text\/html/);
      expect(res.text).to.contain('<!doctype html>');
    });

    it('reports missing required fields', async () => {
      const res = await chai
        .request(app)
        .post('/api/v1/email/preview')
        .set('Authorization', authHeader(admin))
        .send({ template: 'otp', data: { to: 'a@guardian.test' } });

      expect(res).to.have.status(400);
      expect(res.body.fields).to.include('otp');
    });
  });

  /* ------------------------------------------------------------------ */
  describe('send and outbox', () => {
    it('records a dry-run send and reads it back', async () => {
      const sendRes = await chai
        .request(app)
        .post('/api/v1/email/send')
        .set('Authorization', authHeader(admin))
        .send({
          template: 'task-assigned',
          data: {
            to: 'email-nurse@guardian.test',
            name: 'Nadia',
            taskTitle: 'Morning mobility check',
            dueDate: '08 August 2026, 09:00'
          }
        });

      expect(sendRes).to.have.status(202);
      expect(sendRes.body.status).to.equal('dry-run');

      const listRes = await chai
        .request(app)
        .get('/api/v1/email/outbox')
        .set('Authorization', authHeader(admin));

      expect(listRes).to.have.status(200);
      expect(listRes.body.entries[0].template).to.equal('task-assigned');
      expect(listRes.body.entries[0]).to.not.have.property('html');

      const entryRes = await chai
        .request(app)
        .get(`/api/v1/email/outbox/${sendRes.body.id}`)
        .set('Authorization', authHeader(admin));

      expect(entryRes).to.have.status(200);
      expect(entryRes.body.html).to.contain('Morning mobility check');
    });

    it('returns per-recipient results for a bulk send', async () => {
      const res = await chai
        .request(app)
        .post('/api/v1/email/send-bulk')
        .set('Authorization', authHeader(admin))
        .send({
          template: 'daily-report',
          recipients: ['one@guardian.test', 'not-an-email'],
          data: { reportDate: '07 August 2026' }
        });

      expect(res).to.have.status(202);
      expect(res.body.succeeded).to.equal(1);
      expect(res.body.failed).to.equal(1);
    });

    it('clears the outbox', async () => {
      await chai
        .request(app)
        .post('/api/v1/email/test')
        .set('Authorization', authHeader(admin))
        .send({ to: 'a@guardian.test' });

      expect(outbox.size()).to.equal(1);

      const res = await chai
        .request(app)
        .delete('/api/v1/email/outbox')
        .set('Authorization', authHeader(admin));

      expect(res).to.have.status(200);
      expect(outbox.size()).to.equal(0);
    });
  });

  /* ------------------------------------------------------------------ */
  describe('persisted sent inbox', () => {
    async function sendOne(otp) {
      return chai
        .request(app)
        .post('/api/v1/email/send')
        .set('Authorization', authHeader(admin))
        .send({ template: 'otp', data: { to: 'email-nurse@guardian.test', name: 'Nadia', otp } });
    }

    it('persists a send and reads it back from the database, surviving an outbox clear', async () => {
      const sendRes = await sendOne('900001');
      expect(sendRes).to.have.status(202);

      // Wipe the in-memory outbox: the inbox must still find it in MongoDB.
      outbox.clear();

      const listRes = await chai
        .request(app)
        .get('/api/v1/email/inbox')
        .set('Authorization', authHeader(admin));

      expect(listRes).to.have.status(200);
      expect(listRes.body.source).to.equal('db');
      expect(listRes.body.total).to.be.greaterThan(0);
      expect(listRes.body.entries[0].template).to.equal('otp');
      expect(listRes.body.entries[0]).to.not.have.property('html');

      const id = sendRes.body.id;
      const oneRes = await chai
        .request(app)
        .get(`/api/v1/email/inbox/${id}`)
        .set('Authorization', authHeader(admin));

      expect(oneRes).to.have.status(200);
      expect(oneRes.body.html).to.contain('900001');
    });

    it('filters by status and returns stats', async () => {
      await sendOne('900002');

      const dryRes = await chai
        .request(app)
        .get('/api/v1/email/inbox?status=dry-run')
        .set('Authorization', authHeader(admin));
      expect(dryRes.body.total).to.be.greaterThan(0);

      const sentRes = await chai
        .request(app)
        .get('/api/v1/email/inbox?status=sent')
        .set('Authorization', authHeader(admin));
      expect(sentRes.body.total).to.equal(0);

      const statsRes = await chai
        .request(app)
        .get('/api/v1/email/inbox/stats')
        .set('Authorization', authHeader(admin));
      expect(statsRes).to.have.status(200);
      expect(statsRes.body.total).to.be.greaterThan(0);
      expect(statsRes.body.byStatus).to.have.property('dry-run');
    });

    it('clears the persisted inbox', async () => {
      await sendOne('900003');

      const clearRes = await chai
        .request(app)
        .delete('/api/v1/email/inbox')
        .set('Authorization', authHeader(admin));
      expect(clearRes).to.have.status(200);

      const listRes = await chai
        .request(app)
        .get('/api/v1/email/inbox')
        .set('Authorization', authHeader(admin));
      expect(listRes.body.total).to.equal(0);
    });
  });

  /* ------------------------------------------------------------------ */
  describe('send by option (destination + email option)', () => {
    it('sends with only a destination and an option', async () => {
      const res = await chai.request(app)
        .post('/api/v1/email/send-option')
        .set('Authorization', authHeader(admin))
        .send({ to: 'email-nurse@guardian.test', option: 'welcome' });

      expect(res).to.have.status(202);
      expect(res.body.status).to.equal('dry-run');
      expect(res.body.to).to.deep.equal(['email-nurse@guardian.test']);

      const entry = outbox.list({ includeBody: true })[0];
      expect(entry.template).to.equal('welcome');
    });

    it('accepts content overrides via data', async () => {
      const res = await chai.request(app)
        .post('/api/v1/email/send-option')
        .set('Authorization', authHeader(admin))
        .send({ to: 'email-nurse@guardian.test', option: 'otp', data: { otp: '778899' } });

      expect(res).to.have.status(202);
      const entry = outbox.list({ includeBody: true })[0];
      expect(entry.html).to.contain('778899');
    });

    it('rejects a missing option or destination', async () => {
      const noOption = await chai.request(app).post('/api/v1/email/send-option')
        .set('Authorization', authHeader(admin)).send({ to: 'a@guardian.test' });
      expect(noOption).to.have.status(400);

      const noTo = await chai.request(app).post('/api/v1/email/send-option')
        .set('Authorization', authHeader(admin)).send({ option: 'welcome' });
      expect(noTo).to.have.status(400);
    });

    it('requires an admin token', async () => {
      const res = await chai.request(app).post('/api/v1/email/send-option')
        .set('Authorization', authHeader(nurse))
        .send({ to: 'a@guardian.test', option: 'welcome' });
      expect(res).to.have.status(403);
    });
  });

  /* ------------------------------------------------------------------ */
  describe('provider failure handling', () => {
    let originalDryRun;

    beforeEach(() => {
      originalDryRun = providers.PROVIDERS.dryrun;
    });

    afterEach(() => {
      providers.PROVIDERS.dryrun = originalDryRun;
    });

    it('records a failure and returns 502 when the provider rejects', async () => {
      providers.PROVIDERS.dryrun = async () => {
        const error = new Error('rate limited by provider');
        error.statusCode = 502;
        throw error;
      };

      const res = await chai
        .request(app)
        .post('/api/v1/email/send')
        .set('Authorization', authHeader(admin))
        .send({ template: 'otp', data: { to: 'a@guardian.test', otp: '123456' } });

      expect(res).to.have.status(502);
      expect(res.body.outboxId).to.be.a('string');

      const entry = outbox.get(res.body.outboxId);
      expect(entry.status).to.equal('failed');
      expect(entry.error).to.contain('rate limited');
    });
  });

  /* ------------------------------------------------------------------ */
  /* The tests that actually matter: does the real flow send the email?  */
  /* ------------------------------------------------------------------ */
  describe('email as a side effect of real auth flows', () => {
    it('sends a password reset link from POST /api/v1/auth/reset-password-request', async () => {
      const res = await chai
        .request(app)
        .post('/api/v1/auth/reset-password-request')
        .send({ email: nurse.email });

      expect(res).to.have.status(200);

      const entries = outbox.list({ includeBody: true });
      expect(entries, 'no email was produced by the reset flow').to.have.lengthOf(1);

      const entry = entries[0];
      expect(entry.template).to.equal('password-reset');
      expect(entry.to).to.deep.equal([nurse.email]);
      expect(entry.status).to.equal('dry-run');
      expect(entry.html).to.contain('reset-password?token=');
      expect(entry.subject).to.contain('password reset');
    });

  

    it('sends nothing when the reset flow is given an unknown address', async () => {
      const res = await chai
        .request(app)
        .post('/api/v1/auth/reset-password-request')
        .send({ email: 'nobody@guardian.test' });

      expect(res).to.have.status(404);
      expect(outbox.size()).to.equal(0);
    });
  });
});
