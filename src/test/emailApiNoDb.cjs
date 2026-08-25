/**
 * Guardian Email Service — emailApiNoDb.cjs
 *
 * Full HTTP coverage of the /api/v1/email router WITHOUT a database. The auth
 * middleware is stubbed (so no MongoDB user lookup is needed) and the real
 * router, controller and service handle every request. This guarantees the API
 * surface is exercised even in environments with no Mongo available.
 *
 * Author: Graeme Thomas
 * Date:   2026-08-08
 */

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'gmproject';
// Deterministic, delivery-free defaults: nothing leaves the process.
process.env.EMAIL_PROVIDER = 'dryrun';
process.env.EMAIL_DRY_RUN = 'true';
process.env.EMAIL_FROM = 'no-reply@guardian.test';
process.env.EMAIL_SENDER_NAME = 'Guardian Monitor';
process.env.APP_NAME = 'Guardian Monitor';
process.env.APP_URL = 'https://guardian.test';
process.env.BASE_URL = 'https://guardian.test';
process.env.EMAIL_TEST_CONSOLE_ENABLED = 'true';
process.env.EMAIL_INBOX_ENABLED = 'true';

const path = require('path');
const express = require('express');
const chai = require('chai');
const chaiHttp = require('chai-http');

chai.use(chaiHttp);
const { expect } = chai;

// --- Stub the auth middleware so the routes need no database ----------------
// verifyToken -> attaches a fake admin user; verifyRole(...) -> always allows.
const verifyTokenPath = require.resolve('../middleware/verifyToken');
const verifyRolePath = require.resolve('../middleware/verifyRole');

const originalVerifyToken = require.cache[verifyTokenPath];
const originalVerifyRole = require.cache[verifyRolePath];

const outbox = require('../services/emailOutbox');

let emailRoutes;
let app;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'views'));
  app.use('/api/v1/email', emailRoutes);
  return app;
}

describe('email API over HTTP (no database)', function () {
  this.timeout(10000);

  before(() => {
    require.cache[verifyTokenPath] = {
      id: verifyTokenPath,
      filename: verifyTokenPath,
      loaded: true,
      exports: (req, _res, next) => {
        req.user = { _id: 'test-admin' };
        next();
      }
    };

    require.cache[verifyRolePath] = {
      id: verifyRolePath,
      filename: verifyRolePath,
      loaded: true,
      exports: () => (_req, _res, next) => next()
    };

    delete require.cache[require.resolve('../routes/emailRoutes')];

    emailRoutes = require('../routes/emailRoutes');
    app = buildApp();
  });

  const agent = () => chai.request(app);

  beforeEach(() => outbox.clear());

  it('GET /config returns the effective config with keys redacted', async () => {
    const res = await agent().get('/api/v1/email/config');
    expect(res).to.have.status(200);
    expect(res.body.provider).to.equal('dryrun');
    expect(JSON.stringify(res.body)).to.not.match(/xkeysib-[A-Za-z0-9]/);
  });

  it('GET /templates lists the options with field metadata', async () => {
    const res = await agent().get('/api/v1/email/templates');
    expect(res).to.have.status(200);
    expect(res.body.count).to.be.greaterThan(0);
    expect(res.body.templates[0]).to.include.keys('key', 'fields');
  });

  it('GET /templates/:option/sample returns a sample payload', async () => {
    const res = await agent().get('/api/v1/email/templates/otp/sample');
    expect(res).to.have.status(200);
    expect(res.body.sample).to.be.an('object');
  });

  it('POST /preview renders without sending', async () => {
    const res = await agent().post('/api/v1/email/preview')
      .send({ template: 'welcome', data: { to: 'a@b.com', name: 'Sam' } });
    expect(res).to.have.status(200);
    expect(res.body.html).to.contain('<!doctype html>');
    expect(outbox.size()).to.equal(0);
  });

  it('POST /send-option sends with just a destination and an option', async () => {
    const res = await agent().post('/api/v1/email/send-option')
      .send({ to: 'dest@guardian.test', option: 'otp' });
    expect(res).to.have.status(202);
    expect(res.body.status).to.equal('dry-run');
    expect(res.body.to).to.deep.equal(['dest@guardian.test']);
  });

  it('POST /send-option validates missing destination/option', async () => {
    expect(await agent().post('/api/v1/email/send-option').send({ to: 'a@b.com' }))
      .to.have.status(400);
    expect(await agent().post('/api/v1/email/send-option').send({ option: 'otp' }))
      .to.have.status(400);
  });

  it('POST /send sends a templated email', async () => {
    const res = await agent().post('/api/v1/email/send')
      .send({ template: 'otp', data: { to: 'a@guardian.test', otp: '123456' } });
    expect(res).to.have.status(202);
    expect(res.body.status).to.equal('dry-run');
  });

  it('POST /send-raw sends an explicit message', async () => {
    const res = await agent().post('/api/v1/email/send-raw')
      .send({ to: 'a@guardian.test', subject: 'Hi', html: '<p>Hi</p>' });
    expect(res).to.have.status(202);
  });

  it('POST /send-bulk returns per-recipient results', async () => {
    const res = await agent().post('/api/v1/email/send-bulk')
      .send({ template: 'daily-report', recipients: ['a@guardian.test', 'bad'], data: { reportDate: '08 August 2026' } });
    expect(res).to.have.status(202);
    expect(res.body.succeeded).to.equal(1);
    expect(res.body.failed).to.equal(1);
  });

  it('GET /inbox falls back to the in-memory store and lists sends', async () => {
    await agent().post('/api/v1/email/send-option').send({ to: 'dest@guardian.test', option: 'welcome' });
    const res = await agent().get('/api/v1/email/inbox');
    expect(res).to.have.status(200);
    expect(res.body.source).to.equal('memory');
    expect(res.body.total).to.be.greaterThan(0);
    expect(res.body.entries[0].template).to.equal('welcome');
  });

  it('GET /inbox/stats returns counts', async () => {
    await agent().post('/api/v1/email/send-option').send({ to: 'dest@guardian.test', option: 'otp' });
    const res = await agent().get('/api/v1/email/inbox/stats');
    expect(res).to.have.status(200);
    expect(res.body.total).to.be.greaterThan(0);
  });

  it('GET /inbox/:id returns 404 for an unknown id', async () => {
    const res = await agent().get('/api/v1/email/inbox/does-not-exist');
    expect(res).to.have.status(404);
  });

  it('GET /outbox lists recent sends and a single entry with its body', async () => {
    const send = await agent().post('/api/v1/email/send')
      .send({ template: 'otp', data: { to: 'a@guardian.test', otp: '246810' } });
    const one = await agent().get(`/api/v1/email/outbox/${send.body.id}`);
    expect(one).to.have.status(200);
    expect(one.body.html).to.contain('246810');
  });

  it('GET /test-console and /inbox-view render HTML pages', async () => {
    const tc = await agent().get('/api/v1/email/test-console');
    expect(tc).to.have.status(200);
    expect(tc.text).to.match(/<html/i);

    const iv = await agent().get('/api/v1/email/inbox-view');
    expect(iv).to.have.status(200);
    expect(iv.text).to.match(/<html/i);
  });

  it('rejects an unknown template with 400', async () => {
    const res = await agent().post('/api/v1/email/send')
      .send({ template: 'no-such-template', data: { to: 'a@b.com' } });
    expect(res).to.have.status(400);
  });

  after(() => {
    if (originalVerifyToken) {
      require.cache[verifyTokenPath] = originalVerifyToken;
    } else {
      delete require.cache[verifyTokenPath];
    }

    if (originalVerifyRole) {
      require.cache[verifyRolePath] = originalVerifyRole;
    } else {
      delete require.cache[verifyRolePath];
    }

    delete require.cache[require.resolve('../routes/emailRoutes')];
  });
});


