/**
 * Guardian Email Service — emailFlow.cjs
 *
 * Unit tests for the email module: configuration, templates, the sending safety model, the outbox and legacy-mailer compatibility. Requires no database.
 *
 * Author: Graeme Thomas
 * Date:   2026-08-08
 */

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'gmproject';

const chai = require('chai');

const { expect } = chai;

const { getEmailConfig, validateEmailConfig, describeEmailConfig } = require('../config/emailConfig');
const { listTemplates, getTemplateSample, buildEmailTemplate } = require('../templates/emailTemplates');
const emailService = require('../services/emailService');
const outbox = require('../services/emailOutbox');
const mailer = require('../utils/mailer');

// Snapshot the environment so each test can mutate it freely.
const ENV_KEYS = [
  'EMAIL_PROVIDER',
  'EMAIL_FROM',
  'EMAIL_SENDER_NAME',
  'EMAIL_DRY_RUN',
  'EMAIL_ALLOWLIST',
  'EMAIL_ALLOWLIST_ENFORCE',
  'APP_NAME',
  'APP_URL',
  'BASE_URL',
  'RESEND_API_KEY',
  'BREVO_API_KEY',
  'MAILERSEND_API_KEY',
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_SECURE',
  'SMTP_USER',
  'SMTP_PASSWORD',
  'SMTP_REJECT_UNAUTHORIZED',
  'EMAIL_LOGO_URL',
  'EMAIL_ORG_ADDRESS',
  'EMAIL_UNSUBSCRIBE_URL',
  'EMAIL_TIMEZONE',
  'EMAIL_LOCALE'
];

const originalEnv = {};

function resetEnv() {
  ENV_KEYS.forEach(key => {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  });
}

describe('email module', function () {
  this.timeout(10000);

  before(() => {
    ENV_KEYS.forEach(key => {
      originalEnv[key] = process.env[key];
    });
  });

  beforeEach(() => {
    resetEnv();
    outbox.clear();

    // Safe defaults: nothing leaves the process during tests.
    process.env.EMAIL_PROVIDER = 'dryrun';
    process.env.EMAIL_FROM = 'no-reply@guardian.test';
    process.env.EMAIL_SENDER_NAME = 'Guardian Monitor';
    process.env.APP_NAME = 'Guardian Monitor';
    process.env.APP_URL = 'https://guardian.test';
    process.env.BASE_URL = 'https://guardian.test';
    process.env.EMAIL_ALLOWLIST = '';
    process.env.EMAIL_ALLOWLIST_ENFORCE = 'false';
    delete process.env.EMAIL_DRY_RUN;
  });

  after(() => {
    resetEnv();
    outbox.clear();
  });

  /* ------------------------------------------------------------------ */
  describe('configuration', () => {
    it('defaults to the dry-run provider and validates cleanly', () => {
      const config = getEmailConfig();
      const validation = validateEmailConfig(config);

      expect(config.provider).to.equal('dryrun');
      expect(validation.ok).to.equal(true);
      expect(validation.warnings.join(' ')).to.contain('dryrun');
    });

    it('rejects an unsupported provider', () => {
      process.env.EMAIL_PROVIDER = 'carrier-pigeon';
      const validation = validateEmailConfig(getEmailConfig());

      expect(validation.ok).to.equal(false);
      expect(validation.errors.join(' ')).to.contain('EMAIL_PROVIDER');
    });

    it('requires an API key for a real provider when not dry running', () => {
      process.env.EMAIL_PROVIDER = 'resend';
      delete process.env.RESEND_API_KEY;

      const validation = validateEmailConfig(getEmailConfig({ dryRun: false }));

      expect(validation.ok).to.equal(false);
      expect(validation.errors.join(' ')).to.contain('RESEND_API_KEY');
    });

    it('never exposes raw API keys', () => {
      process.env.EMAIL_PROVIDER = 'brevo';
      process.env.BREVO_API_KEY = 'super-secret-key-value';

      const described = describeEmailConfig(getEmailConfig());
      const serialised = JSON.stringify(described);

      expect(serialised).to.not.contain('super-secret-key-value');
      expect(described.keys.brevo).to.contain('set');
    });

    it('honours a per-call provider override', () => {
      process.env.EMAIL_PROVIDER = 'resend';
      expect(getEmailConfig({ provider: 'brevo' }).provider).to.equal('brevo');
    });
  });

  /* ------------------------------------------------------------------ */
  describe('templates', () => {
    it('exposes a non-empty catalogue with field metadata', () => {
      const templates = listTemplates();

      expect(templates).to.be.an('array').that.is.not.empty;
      templates.forEach(template => {
        expect(template).to.include.keys('key', 'name', 'category', 'description', 'fields');
        expect(template.fields).to.be.an('array').that.is.not.empty;
      });
    });

    it('renders every template from its own sample data', () => {
      const config = getEmailConfig();

      listTemplates().forEach(template => {
        const rendered = buildEmailTemplate(template.key, getTemplateSample(template.key), config);

        expect(rendered.subject, `${template.key} subject`).to.be.a('string').with.length.greaterThan(0);
        expect(rendered.html, `${template.key} html`).to.contain('<!doctype html>');
        expect(rendered.text, `${template.key} text`).to.be.a('string').with.length.greaterThan(0);
      });
    });

    it('reports missing required fields instead of rendering', () => {
      const config = getEmailConfig();

      expect(() => buildEmailTemplate('otp', { to: 'a@b.com' }, config))
        .to.throw(/Missing required fields/);
    });

    it('rejects an unknown template key', () => {
      expect(() => buildEmailTemplate('does-not-exist', {}, getEmailConfig()))
        .to.throw(/Unknown email template/);
    });

    it('escapes HTML in user-supplied values', () => {
      const rendered = buildEmailTemplate(
        'patient-alert',
        {
          to: 'nurse@guardian.test',
          patientName: '<script>alert(1)</script>',
          alertType: 'Fall detected',
          severity: 'high'
        },
        getEmailConfig()
      );

      expect(rendered.html).to.not.contain('<script>alert(1)</script>');
      expect(rendered.html).to.contain('&lt;script&gt;');
    });

    it('refuses to place a javascript: URL into an href', () => {
      const rendered = buildEmailTemplate(
        'verify-email',
        { to: 'a@b.com', verificationUrl: 'javascript:alert(1)' },
        getEmailConfig()
      );

      expect(rendered.html).to.not.contain('javascript:');
    });

    it('builds the reset link from a token when no URL is supplied', () => {
      const rendered = buildEmailTemplate(
        'password-reset',
        { to: 'a@b.com', name: 'Alex', token: 'abc123' },
        getEmailConfig()
      );

      expect(rendered.text).to.contain('https://guardian.test/api/v1/auth/reset-password?token=abc123');
    });
  });

  /* ------------------------------------------------------------------ */
  describe('sending', () => {
    it('records a dry-run send in the outbox without delivering', async () => {
      const result = await emailService.sendTemplatedEmail('otp', {
        to: 'nurse@guardian.test',
        name: 'Alex',
        otp: '123456'
      });

      expect(result.status).to.equal('dry-run');
      expect(result.provider).to.equal('dryrun');
      expect(result.messageId).to.be.a('string');

      const entries = outbox.list({ includeBody: true });
      expect(entries).to.have.lengthOf(1);
      expect(entries[0].template).to.equal('otp');
      expect(entries[0].html).to.contain('123456');
    });

    it('rejects an invalid recipient address', async () => {
      try {
        await emailService.sendTemplatedEmail('otp', { to: 'not-an-email', otp: '123456' });
        throw new Error('expected a validation failure');
      } catch (error) {
        expect(error.statusCode).to.equal(400);
        expect(error.message).to.contain('Invalid recipient');
      }
    });

    it('requires a subject and a body for a raw send', async () => {
      try {
        await emailService.sendRawEmail({ to: 'a@b.com', subject: 'Hi' });
        throw new Error('expected a validation failure');
      } catch (error) {
        expect(error.statusCode).to.equal(400);
        expect(error.message).to.contain('html or text');
      }
    });

    it('blocks a recipient that is not on the allowlist', async () => {
      process.env.EMAIL_ALLOWLIST_ENFORCE = 'true';
      process.env.EMAIL_ALLOWLIST = '@guardian.test';

      try {
        await emailService.sendTemplatedEmail('otp', { to: 'stranger@elsewhere.com', otp: '111111' });
        throw new Error('expected the allowlist to block delivery');
      } catch (error) {
        expect(error.statusCode).to.equal(403);
        expect(error.blockedRecipients).to.deep.equal(['stranger@elsewhere.com']);
      }

      const entries = outbox.list();
      expect(entries[0].status).to.equal('blocked');
    });

    it('allows a recipient whose domain is on the allowlist', async () => {
      process.env.EMAIL_ALLOWLIST_ENFORCE = 'true';
      process.env.EMAIL_ALLOWLIST = 'guardian.test';

      const result = await emailService.sendTemplatedEmail('otp', {
        to: 'nurse@guardian.test',
        otp: '222222'
      });

      expect(result.status).to.equal('dry-run');
      expect(result.blockedRecipients).to.be.empty;
    });

    it('forces dry run even when a real provider is selected', async () => {
      process.env.EMAIL_PROVIDER = 'resend';
      process.env.RESEND_API_KEY = 'test-key';

      const result = await emailService.sendTemplatedEmail(
        'otp',
        { to: 'nurse@guardian.test', otp: '333333' },
        { dryRun: true }
      );

      expect(result.status).to.equal('dry-run');
      expect(result.provider).to.equal('dryrun');
    });

    it('returns per-recipient results for a bulk send', async () => {
      const summary = await emailService.sendBulkTemplatedEmail(
        'daily-report',
        ['one@guardian.test', 'broken-address', 'two@guardian.test'],
        { reportDate: '07 August 2026' }
      );

      expect(summary.total).to.equal(3);
      expect(summary.succeeded).to.equal(2);
      expect(summary.failed).to.equal(1);
    });

    it('sends the built-in smoke test', async () => {
      const result = await emailService.sendTestEmail('nurse@guardian.test');

      expect(result.template).to.equal('render-check');
      expect(result.status).to.equal('dry-run');
    });

    it('fails cleanly with 502 when a provider returns no result', async () => {
      const providers = require('../providers');
      const original = providers.PROVIDERS.dryrun;
      providers.PROVIDERS.dryrun = async () => undefined;
      try {
        await emailService.sendTemplatedEmail('otp', { to: 'a@guardian.test', otp: '111111' });
        throw new Error('expected a provider failure');
      } catch (error) {
        expect(error.statusCode).to.equal(502);
        expect(error.message).to.contain('no result');
        expect(outbox.list()[0].status).to.equal('failed');
      } finally {
        providers.PROVIDERS.dryrun = original;
      }
    });
  });

  /* ------------------------------------------------------------------ */
  describe('outbox', () => {
    it('caps stored entries and returns newest first', async () => {
      await emailService.sendTemplatedEmail('otp', { to: 'a@guardian.test', otp: '111111' });
      await emailService.sendTemplatedEmail('otp', { to: 'b@guardian.test', otp: '222222' });

      const entries = outbox.list();

      expect(entries).to.have.lengthOf(2);
      expect(entries[0].to).to.deep.equal(['b@guardian.test']);
      expect(outbox.size()).to.be.at.most(outbox.MAX_ENTRIES);
    });

    it('omits message bodies unless explicitly requested', async () => {
      await emailService.sendTemplatedEmail('otp', { to: 'a@guardian.test', otp: '111111' });

      const summary = outbox.list()[0];
      expect(summary).to.not.have.property('html');
      expect(summary.htmlLength).to.be.greaterThan(0);

      const full = outbox.list({ includeBody: true })[0];
      expect(full.html).to.be.a('string');
    });
  });

  /* ------------------------------------------------------------------ */
  describe('smtp provider', () => {
    const { resolveProvider, verifyProviderConnection } = require('../providers');

    it('is registered in the provider dispatcher', () => {
      expect(resolveProvider('smtp')).to.be.a('function');
      expect(getEmailConfig().supportedProviders).to.include('smtp');
    });

    it('requires SMTP_HOST when not dry running', () => {
      process.env.EMAIL_PROVIDER = 'smtp';
      delete process.env.SMTP_HOST;

      const validation = validateEmailConfig(getEmailConfig({ dryRun: false }));
      expect(validation.ok).to.equal(false);
      expect(validation.errors.join(' ')).to.contain('SMTP_HOST');
    });

    it('relaxes TLS verification for a local mail catcher only', () => {
      process.env.EMAIL_PROVIDER = 'smtp';

      process.env.SMTP_HOST = 'localhost';
      expect(getEmailConfig().smtpRejectUnauthorized).to.equal(false);

      process.env.SMTP_HOST = 'mailpit';
      expect(getEmailConfig().smtpRejectUnauthorized).to.equal(false);

      process.env.SMTP_HOST = 'smtp.office365.com';
      expect(getEmailConfig().smtpRejectUnauthorized).to.equal(true);
    });

    it('reports verification as unsupported for HTTP API providers', async () => {
      process.env.EMAIL_PROVIDER = 'resend';
      const result = await verifyProviderConnection(getEmailConfig());

      expect(result.supported).to.equal(false);
      expect(result.ok).to.equal(null);
    });

    // Runs only when the optional `smtp-server` dev dependency is present:
    //   npm install --save-dev smtp-server
    let SMTPServer = null;
    try {
      // eslint-disable-next-line global-require, import/no-extraneous-dependencies
      SMTPServer = require('smtp-server').SMTPServer;
    } catch (error) {
      SMTPServer = null;
    }

    (SMTPServer ? describe : describe.skip)('against a live local SMTP server', () => {
      const PORT = 2526;
      let server;
      let received;

      beforeEach(done => {
        received = [];
        server = new SMTPServer({
          authOptional: true,
          onData(stream, session, callback) {
            let raw = '';
            stream.on('data', chunk => { raw += chunk; });
            stream.on('end', () => {
              received.push({ to: session.envelope.rcptTo.map(r => r.address), raw });
              callback();
            });
          }
        });
        server.listen(PORT, '127.0.0.1', done);
      });

      afterEach(done => {
        require('../providers/smtpProvider').resetSmtpTransport();
        server.close(done);
      });

      it('delivers a real multipart message and verifies the connection', async () => {
        process.env.EMAIL_PROVIDER = 'smtp';
        process.env.EMAIL_DRY_RUN = 'false';
        process.env.SMTP_HOST = '127.0.0.1';
        process.env.SMTP_PORT = String(PORT);

        const check = await emailService.verifyConnection();
        expect(check.ok).to.equal(true);

        const result = await emailService.sendTemplatedEmail('otp', {
          to: 'nurse@guardian.test',
          name: 'Alex',
          otp: '778899'
        });

        expect(result.status).to.equal('sent');
        expect(result.provider).to.equal('smtp');
        expect(result.messageId).to.be.a('string');

        expect(received).to.have.lengthOf(1);
        expect(received[0].to).to.deep.equal(['nurse@guardian.test']);
        expect(received[0].raw).to.contain('multipart/alternative');
        expect(received[0].raw).to.contain('778899');
      });

      it('delivers an attachment and a List-Unsubscribe header over SMTP', async () => {
        process.env.EMAIL_PROVIDER = 'smtp';
        process.env.EMAIL_DRY_RUN = 'false';
        process.env.SMTP_HOST = '127.0.0.1';
        process.env.SMTP_PORT = String(PORT);
        process.env.EMAIL_UNSUBSCRIBE_URL = 'https://guardian.test/unsubscribe';

        const result = await emailService.sendRawEmail(
          {
            to: 'nurse@guardian.test',
            subject: 'Statement attached',
            text: 'Your statement is attached.',
            attachments: [{ filename: 'statement.txt', content: 'Guardian statement body' }]
          },
          { template: 'raw' }
        );

        expect(result.status).to.equal('sent');
        expect(received).to.have.lengthOf(1);
        expect(received[0].raw).to.contain('statement.txt');
        expect(received[0].raw.toLowerCase()).to.contain('list-unsubscribe');
      });
    });
  });

  /* ------------------------------------------------------------------ */
  describe('layout and branding', () => {
    const { baseTemplate, callout } = require('../templates/baseTemplate');

    it('shows the product name in the header when no logo is configured', () => {
      delete process.env.EMAIL_LOGO_URL;
      const html = baseTemplate({ appName: 'Guardian Monitor', heading: 'Hi', body: '<p>x</p>' });
      expect(html).to.contain('Guardian Monitor');
      expect(html).to.not.contain('<img');
    });

    it('renders a logo image when EMAIL_LOGO_URL is set', () => {
      process.env.EMAIL_LOGO_URL = 'https://cdn.example.com/logo.png';
      const html = baseTemplate({ appName: 'Guardian Monitor', heading: 'Hi', body: '<p>x</p>' });
      expect(html).to.contain('<img');
      expect(html).to.contain('https://cdn.example.com/logo.png');
      expect(html).to.contain('alt="Guardian Monitor"');
    });

    it('ignores an unsafe logo URL', () => {
      process.env.EMAIL_LOGO_URL = 'javascript:alert(1)';
      const html = baseTemplate({ appName: 'Guardian Monitor', heading: 'Hi', body: '<p>x</p>' });
      expect(html).to.not.contain('javascript:');
      expect(html).to.not.contain('<img');
    });

    it('includes an Outlook (VML) bulletproof button when a link is given', () => {
      const html = baseTemplate({
        appName: 'Guardian', heading: 'Hi', body: '<p>x</p>',
        buttonText: 'Go', buttonUrl: 'https://guardian.test/go'
      });
      expect(html).to.contain('v:roundrect');
      expect(html).to.contain('https://guardian.test/go');
    });

    it('declares dark-mode support', () => {
      const html = baseTemplate({ appName: 'Guardian', heading: 'Hi', body: '<p>x</p>' });
      expect(html).to.contain('color-scheme');
      expect(html).to.contain('prefers-color-scheme: dark');
    });

    it('renders a postal address and unsubscribe link in the footer when configured', () => {
      process.env.EMAIL_ORG_ADDRESS = '1 Care Street, Perth WA 6000';
      process.env.EMAIL_UNSUBSCRIBE_URL = 'https://guardian.test/unsubscribe';
      const html = baseTemplate({ appName: 'Guardian', heading: 'Hi', body: '<p>x</p>' });
      expect(html).to.contain('1 Care Street, Perth WA 6000');
      expect(html).to.contain('Unsubscribe');
      expect(html).to.contain('https://guardian.test/unsubscribe');
    });

    it('builds a coloured callout panel', () => {
      const html = callout('critical', 'Locked', 'Your account is locked.');
      expect(html).to.contain('Locked');
      expect(html).to.contain('Your account is locked.');
      expect(html).to.contain('border-left');
    });
  });

  /* ------------------------------------------------------------------ */
  describe('date formatting', () => {
    const { formatDateTime } = require('../utils/datetime');

    it('formats an ISO timestamp in the Australia/Perth timezone', () => {
      // 01:30 UTC == 09:30 in Perth (UTC+8)
      const out = formatDateTime('2026-08-20T01:30:00Z', { timeZone: 'Australia/Perth', locale: 'en-AU' });
      expect(out).to.contain('2026');
      expect(out).to.match(/9:30\s?am/i);
    });

    it('passes through text that is not a date', () => {
      expect(formatDateTime('next Tuesday morning')).to.equal('next Tuesday morning');
    });

    it('supports a date-only format', () => {
      const out = formatDateTime('2026-08-20T01:30:00Z', { dateOnly: true });
      expect(out).to.not.match(/am|pm/i);
      expect(out).to.contain('2026');
    });
  });

  /* ------------------------------------------------------------------ */
  describe('new templates', () => {
    it('registers the health, security and billing templates', () => {
      const keys = listTemplates().map(t => t.key);
      ['appointment-reminder', 'appointment-confirmed', 'appointment-cancelled', 'results-ready',
       'secure-message', 'account-locked', 'suspicious-login', 'two-factor-enabled',
       'shift-reminder', 'receipt'].forEach(key => expect(keys, key).to.include(key));
    });

    it('exposes Health, Security and Billing categories', () => {
      const categories = new Set(listTemplates().map(t => t.category));
      ['Health', 'Security', 'Billing'].forEach(c => expect(categories, c).to.include(c));
    });

    it('formats the appointment date inside the rendered email', () => {
      const rendered = buildEmailTemplate(
        'appointment-reminder',
        { to: 'carer@guardian.test', name: 'Alex', appointmentType: 'GP review', when: '2026-08-20T01:30:00Z' },
        getEmailConfig()
      );
      expect(rendered.html).to.contain('2026');
      expect(rendered.subject).to.contain('Reminder');
    });

    it('keeps results-ready free of clinical detail', () => {
      const rendered = buildEmailTemplate(
        'results-ready',
        { to: 'p@guardian.test', portalUrl: 'https://guardian.test/results' },
        getEmailConfig()
      );
      expect(rendered.html).to.contain('secure');
      expect(rendered.html).to.contain('https://guardian.test/results');
    });
  });

  /* ------------------------------------------------------------------ */
  describe('deliverability: headers and attachments', () => {
    it('records attachment metadata and rejects a malformed attachment', async () => {
      const result = await emailService.sendRawEmail(
        {
          to: 'nurse@guardian.test',
          subject: 'With attachment',
          text: 'see attached',
          attachments: [{ filename: 'note.txt', content: 'hello' }]
        },
        { template: 'raw' }
      );
      expect(result.status).to.equal('dry-run');

      const entry = outbox.list()[0];
      expect(entry.attachments).to.be.an('array').with.lengthOf(1);
      expect(entry.attachments[0].filename).to.equal('note.txt');

      try {
        await emailService.sendRawEmail(
          { to: 'nurse@guardian.test', subject: 'Bad', text: 'x', attachments: [{ content: 'no filename' }] },
          { template: 'raw' }
        );
        throw new Error('expected a validation failure');
      } catch (error) {
        expect(error.statusCode).to.equal(400);
        expect(error.message).to.contain('filename');
      }
    });

    it('attaches a List-Unsubscribe header when an unsubscribe URL is configured', async () => {
      process.env.EMAIL_UNSUBSCRIBE_URL = 'https://guardian.test/unsubscribe';
      await emailService.sendRawEmail(
        { to: 'nurse@guardian.test', subject: 'Hi', text: 'x' },
        { template: 'raw' }
      );
      const entry = outbox.list()[0];
      expect(entry.headers).to.have.property('List-Unsubscribe');
      expect(entry.headers['List-Unsubscribe']).to.contain('https://guardian.test/unsubscribe');
      expect(entry.headers).to.have.property('X-Guardian-Template', 'raw');
    });
  });

  /* ------------------------------------------------------------------ */
  describe('sent inbox (no database connected)', () => {
    const sentInbox = require('../services/sentInbox');

    it('reports itself unavailable when Mongo is not connected', () => {
      expect(sentInbox.available()).to.equal(false);
    });

    it('persist() is a no-op that never throws without a database', async () => {
      const result = await sentInbox.persist({ id: 'x', to: ['a@b.com'], status: 'sent', html: '<p>x</p>' });
      expect(result).to.equal(null);
    });

    it('a send still succeeds even though persistence is unavailable', async () => {
      const result = await emailService.sendTemplatedEmail('otp', { to: 'a@guardian.test', otp: '424242' });
      expect(result.status).to.equal('dry-run');
      // The in-memory outbox is still the fallback source for the inbox API.
      expect(outbox.list()[0].template).to.equal('otp');
    });
  });

  /* ------------------------------------------------------------------ */
  describe('swagger docs augmentation', () => {
    const { augmentEmailDocs, PROVIDER_ENUM } = require('../config/swaggerEmail');

    function fakeSpec() {
      const body = props => ({
        post: { requestBody: { content: { 'application/json': { schema: { properties: props } } } } }
      });
      return {
        paths: {
          '/api/v1/email/send': body({ template: { type: 'string' }, provider: { type: 'string' } }),
          '/api/v1/email/preview': body({ template: { type: 'string' } }),
          '/api/v1/email/send-raw': body({ provider: { type: 'string' } })
        }
      };
    }

    it('turns the template field into a dropdown of every template', () => {
      const spec = augmentEmailDocs(fakeSpec());
      const send = spec.paths['/api/v1/email/send'].post.requestBody.content['application/json'].schema.properties;
      expect(send.template.enum).to.be.an('array').with.lengthOf(listTemplates().length);
      expect(send.template.enum).to.include('password-reset').and.to.include('appointment-reminder');
    });

    it('offers every provider, including smtp, as an override', () => {
      const spec = augmentEmailDocs(fakeSpec());
      const send = spec.paths['/api/v1/email/send'].post.requestBody.content['application/json'].schema.properties;
      expect(send.provider.enum).to.deep.equal(PROVIDER_ENUM);
      expect(send.provider.enum).to.include('smtp').and.to.include('brevo');
    });

    it('does not throw on an empty spec', () => {
      expect(() => augmentEmailDocs({})).to.not.throw();
      expect(() => augmentEmailDocs(null)).to.not.throw();
    });

    it('buildSwaggerSpec() produces a complete, accurate spec for consumers', () => {
      const { buildSwaggerSpec } = require('../config/swagger');
      const spec = buildSwaggerSpec();

      // Covers the real API, not a stale hand-written file.
      expect(Object.keys(spec.paths).length).to.be.greaterThan(50);
      expect(spec.paths).to.have.property('/api/v1/auth/login');
      expect(spec.paths).to.have.property('/api/v1/email/send');

      // The email augmentation is applied in the shared builder too.
      const send = spec.paths['/api/v1/email/send'].post.requestBody.content['application/json'].schema.properties;
      expect(send.template.enum).to.have.lengthOf(listTemplates().length);
    });
  });

  /* ------------------------------------------------------------------ */
  describe('brevo provider payload', () => {
    it('builds a Brevo payload with sender, recipient, body and List-Unsubscribe', async () => {
      const Brevo = require('@getbrevo/brevo');
      const originalSend = Brevo.TransactionalEmailsApi.prototype.sendTransacEmail;
      let captured = null;
      Brevo.TransactionalEmailsApi.prototype.sendTransacEmail = async function (email) {
        captured = email;
        return { body: { messageId: '<brevo-test-id>' } };
      };

      process.env.EMAIL_PROVIDER = 'brevo';
      process.env.BREVO_API_KEY = 'xkeysib-test';
      process.env.EMAIL_DRY_RUN = 'false';
      process.env.EMAIL_UNSUBSCRIBE_URL = 'https://guardian.test/unsubscribe';

      try {
        const result = await emailService.sendTemplatedEmail('welcome', {
          to: 'nurse@guardian.test', name: 'Alex', role: 'Nurse'
        });

        expect(result.status).to.equal('sent');
        expect(result.provider).to.equal('brevo');
        expect(result.messageId).to.equal('<brevo-test-id>');
        expect(captured.sender.email).to.equal('no-reply@guardian.test');
        expect(captured.to[0].email).to.equal('nurse@guardian.test');
        expect(captured.subject).to.contain('Welcome');
        expect(captured.htmlContent).to.contain('<!doctype html>');
        expect(captured.headers['List-Unsubscribe']).to.contain('https://guardian.test/unsubscribe');
      } finally {
        Brevo.TransactionalEmailsApi.prototype.sendTransacEmail = originalSend;
      }
    });
  });

  /* ------------------------------------------------------------------ */
  describe('brevo focus: send-by-option and key verification', () => {
    it('sendByOption fills missing fields from the sample and sends', async () => {
      const result = await emailService.sendByOption('otp', 'dest@guardian.test');
      expect(result.status).to.equal('dry-run');
      expect(result.to).to.deep.equal(['dest@guardian.test']);
      expect(result.subject).to.contain('verification code');
    });

    it('sendByOption lets you override content fields', async () => {
      await emailService.sendByOption('otp', 'dest@guardian.test', { otp: '424242' });
      const entry = outbox.list({ includeBody: true })[0];
      expect(entry.html).to.contain('424242');
    });

    it('sendByOption rejects an unknown option and a missing destination', async () => {
      try {
        await emailService.sendByOption('does-not-exist', 'a@b.com');
        throw new Error('expected failure');
      } catch (e) { expect(e.statusCode).to.equal(400); }

      try {
        await emailService.sendByOption('otp', '');
        throw new Error('expected failure');
      } catch (e) { expect(e.statusCode).to.equal(400); }
    });

    it('delivers via Brevo when a key is set (network stubbed)', async () => {
      const Brevo = require('@getbrevo/brevo');
      const original = Brevo.TransactionalEmailsApi.prototype.sendTransacEmail;
      let captured = null;
      Brevo.TransactionalEmailsApi.prototype.sendTransacEmail = async function (email) {
        captured = email;
        return { body: { messageId: '<brevo-option-id>' } };
      };

      process.env.EMAIL_PROVIDER = 'brevo';
      process.env.BREVO_API_KEY = 'xkeysib-test';
      process.env.EMAIL_DRY_RUN = 'false';

      try {
        const result = await emailService.sendByOption('welcome', 'dest@guardian.test', { name: 'Dana' });
        expect(result.status).to.equal('sent');
        expect(result.provider).to.equal('brevo');
        expect(result.messageId).to.equal('<brevo-option-id>');
        expect(captured.to[0].email).to.equal('dest@guardian.test');
        expect(captured.subject).to.contain('Welcome');
      } finally {
        Brevo.TransactionalEmailsApi.prototype.sendTransacEmail = original;
      }
    });

    it('verifies the Brevo API key without sending (network stubbed)', async () => {
      const Brevo = require('@getbrevo/brevo');
      const original = Brevo.AccountApi.prototype.getAccount;

      process.env.EMAIL_PROVIDER = 'brevo';
      process.env.BREVO_API_KEY = 'xkeysib-test';

      try {
        Brevo.AccountApi.prototype.getAccount = async function () {
          return { body: { email: 'owner@guardian.test', companyName: 'Guardian' } };
        };
        const ok = await emailService.verifyConnection();
        expect(ok.supported).to.equal(true);
        expect(ok.ok).to.equal(true);
        expect(ok.provider).to.equal('brevo');
        expect(ok.email).to.equal('owner@guardian.test');

        Brevo.AccountApi.prototype.getAccount = async function () {
          const err = new Error('Key not found');
          err.response = { body: { message: 'Key not found' } };
          throw err;
        };
        const bad = await emailService.verifyConnection();
        expect(bad.ok).to.equal(false);
        expect(bad.error).to.contain('Key');
      } finally {
        Brevo.AccountApi.prototype.getAccount = original;
      }
    });
  });

  /* ------------------------------------------------------------------ */
  describe('source override and patient ID parameters', () => {
    it('accepts a per-request source (from / fromName) on a raw send', async () => {
      await emailService.sendRawEmail({
        to: 'a@guardian.test', subject: 'Hi', text: 'x',
        from: 'clinic@myhospital.org', fromName: 'Northside Clinic'
      });
      expect(outbox.list()[0].from).to.equal('Northside Clinic <clinic@myhospital.org>');
    });

    it('accepts source override on a templated send via data', async () => {
      await emailService.sendTemplatedEmail('welcome', {
        to: 'a@guardian.test', name: 'Sam', from: 'noreply@dept.gov.au', fromName: 'Dept Health'
      });
      expect(outbox.list()[0].from).to.equal('Dept Health <noreply@dept.gov.au>');
    });

    it('falls back to the configured sender when no source is given', async () => {
      await emailService.sendTemplatedEmail('welcome', { to: 'a@guardian.test', name: 'Sam' });
      expect(outbox.list()[0].from).to.equal('Guardian Monitor <no-reply@guardian.test>');
    });

    it('rejects an invalid source address', async () => {
      try {
        await emailService.sendRawEmail({ to: 'a@guardian.test', subject: 'Hi', text: 'x', from: 'not-an-email' });
        throw new Error('expected a validation failure');
      } catch (error) {
        expect(error.statusCode).to.equal(400);
        expect(error.message).to.contain('source');
      }
    });

    it('renders a Patient ID when provided to care/monitoring templates', () => {
      const cfg = getEmailConfig();
      ['patient-alert', 'task-assigned', 'care-plan-updated', 'daily-report'].forEach(key => {
        const rendered = buildEmailTemplate(key, {
          to: 'a@guardian.test', patientName: 'Margaret Doyle', patientId: 'PT-000123',
          alertType: 'Fall detected', taskTitle: 'Check', reportDate: '08 August 2026', changeSummary: 'x'
        }, cfg);
        expect(rendered.html, key).to.contain('PT-000123');
      });
    });
  });

  /* ------------------------------------------------------------------ */
  describe('legacy mailer compatibility', () => {
    it('keeps the original exported function names', () => {
      expect(mailer.sendEmail).to.be.a('function');
      expect(mailer.sendPasswordResetEmail).to.be.a('function');
      expect(mailer.sendPinCodeVerificationEmail).to.be.a('function');
    });

    it('routes sendPinCodeVerificationEmail through the otp template', async () => {
      await mailer.sendPinCodeVerificationEmail('nurse@guardian.test', 'Alex', '654321');

      const entry = outbox.list({ includeBody: true })[0];
      expect(entry.template).to.equal('otp');
      expect(entry.html).to.contain('654321');
    });

    it('routes sendPasswordResetEmail through the password-reset template', async () => {
      await mailer.sendPasswordResetEmail('nurse@guardian.test', 'Alex', 'tok-123');

      const entry = outbox.list({ includeBody: true })[0];
      expect(entry.template).to.equal('password-reset');
      expect(entry.html).to.contain('tok-123');
    });

    it('sends an ad-hoc message through sendEmail', async () => {
      await mailer.sendEmail('nurse@guardian.test', 'Subject line', 'Body text', '<p>Body</p>');

      const entry = outbox.list({ includeBody: true })[0];
      expect(entry.subject).to.equal('Subject line');
      expect(entry.status).to.equal('dry-run');
    });
  });
});
