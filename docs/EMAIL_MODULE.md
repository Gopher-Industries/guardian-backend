# Guardian Email Module

A provider-independent email layer for `guardian-backend`, built along the same
lines as the Health API email module but written in Guardian's CommonJS/Express
conventions and wired into its existing auth, Swagger and Mocha setup.

## What changes

| Before | After |
| --- | --- |
| `src/utils/mailer.js` talks to MailerSend directly | `src/utils/mailer.js` is a thin shim over the new service |
| One hard-coded provider | `resend`, `brevo`, `mailersend`, `smtp`, `dryrun` — switchable per request |
| Two inline HTML templates | 13 templates in a registry with field metadata |
| `.catch(console.log)` swallows failures | Failures reject and are recorded |
| No way to test without sending | Dry run, allowlist, outbox and a browser console |

The three exported function names in `utils/mailer.js` are unchanged, so
`userController.js` and the mock in `test/authControllerFlow.cjs` keep working
without edits.

## Files

```
src/config/emailConfig.js              Environment resolution and validation
src/providers/index.js                 Provider dispatcher
src/providers/resendProvider.js
src/providers/brevoProvider.js
src/providers/mailersendProvider.js    Keeps the existing transport available
src/providers/smtpProvider.js          nodemailer; local catchers and relays
src/providers/dryRunProvider.js        Renders and records, never delivers
src/templates/baseTemplate.js          Guardian-branded layout + escaping
src/templates/emailTemplates.js        Template registry with field metadata
src/services/emailService.js           Send / render / bulk interface
src/services/emailOutbox.js            Bounded in-memory record of attempts
src/controllers/emailController.js
src/routes/emailRoutes.js              Mounted at /api/v1/email
src/views/email-test-console.ejs       Browser test console
src/utils/mailer.js                    Backwards-compatible shim (REPLACES existing)
src/test/emailFlow.cjs                 26 Mocha tests, no database required
```

## Install

1. Copy the `src/` tree over `guardian-backend/src/`. The only file overwritten
   is `src/utils/mailer.js`.

2. Append `.env.email.example` to your `.env`.

3. Install the SDK for whichever providers you want. All are optional — the
   adapters `require()` lazily, so the backend still boots without them:

   ```bash
   npm install nodemailer                  # smtp: local catchers and relays
   npm install resend @getbrevo/brevo      # hosted API providers
   npm install --save-dev smtp-server      # optional: enables the live SMTP test
   ```

   `mailersend` is already a dependency, and `dryrun` needs nothing.
   For local development `nodemailer` alone is enough.

4. Mount the routes in `src/server.js`, alongside the other route requires:

   ```js
   const emailRoutes = require('./routes/emailRoutes');
   ```

   and with the other mounts:

   ```js
   app.use('/api/v1/email', emailRoutes);
   ```

5. Optionally add the same line to `src/test/helpers/testApp.cjs` in the
   `routeMounts` array so integration tests can reach the endpoints:

   ```js
   ['/api/v1/email', '../../routes/emailRoutes'],
   ```

6. Run the tests:

   ```bash
   npx mocha 'src/test/emailFlow.cjs' --exit        # no MongoDB, no API keys
   npx mocha 'src/test/emailRoutesFlow.cjs' --exit  # needs MongoDB
   ```

   See `docs/TESTING.md` for the full testing approach.

## The test console

Open `http://localhost:3000/api/v1/email/test-console`.

The page itself is static and carries no configuration. Paste an **admin**
bearer token (from `POST /api/v1/auth/login`) and press Connect; every action it
performs goes through the authenticated API.

From there you can:

- pick any template from the catalogue — the form fields are generated from the
  template's own metadata, so new templates appear automatically
- press **Load sample** to populate realistic values
- press **Preview** to render into a sandboxed iframe with the subject line and
  the plain-text alternative side by side, without sending anything
- press **Send** with **Dry run** ticked to exercise the full send path
  (validation, allowlist, outbox) while guaranteeing nothing is delivered
- untick Dry run, choose a provider override, and send a real message
- browse the **Outbox** tab and click any row to load that exact message back
  into the preview pane — including failures and blocked recipients

Set `EMAIL_TEST_CONSOLE_ENABLED=false` to disable it. It is off by default when
`NODE_ENV=production`.

## Sending from application code

```js
const { sendTemplatedEmail } = require('../services/emailService');

await sendTemplatedEmail('patient-alert', {
  to: carer.email,
  name: carer.fullname.split(' ')[0],
  patientName: patient.name,
  alertType: 'Fall detected',
  severity: 'critical',
  detectedAt: new Date().toLocaleString('en-AU', { timeZone: 'Australia/Perth' }),
  location: 'Room 12, East Wing',
  alertUrl: `${process.env.APP_URL}/alerts/${alert._id}`
});
```

Per-call overrides:

```js
await sendTemplatedEmail('otp', data, { provider: 'brevo', dryRun: true });
```

Bulk, one message per recipient, returning per-recipient results rather than
failing the whole batch:

```js
await sendBulkTemplatedEmail('daily-report',
  ['a@example.com', 'b@example.com'],
  { reportDate: '07 August 2026' });
```

## API

All endpoints require a bearer token for a user with the `admin` role.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/v1/email/config` | Effective config, API keys redacted, plus validation state |
| POST | `/api/v1/email/verify-connection` | SMTP handshake without sending; unsupported for API providers |
| GET | `/api/v1/email/templates` | Template catalogue with field metadata |
| GET | `/api/v1/email/templates/:type/sample` | Sample payload for a template |
| POST | `/api/v1/email/preview` | Render without sending (`format: "html"` returns the raw document) |
| POST | `/api/v1/email/send` | Send a templated email |
| POST | `/api/v1/email/send-raw` | Send an explicit subject/body |
| POST | `/api/v1/email/send-bulk` | One message per recipient |
| POST | `/api/v1/email/test` | Built-in rendering smoke test |
| GET | `/api/v1/email/outbox` | Recent attempts, newest first |
| GET | `/api/v1/email/outbox/:id` | One entry including the rendered body |
| GET | `/api/v1/email/outbox/:id/html` | The rendered HTML alone |
| DELETE | `/api/v1/email/outbox` | Clear the outbox |
| GET | `/api/v1/email/test-console` | Browser console (no auth on the page itself) |

Everything is annotated with `@swagger` blocks, so it appears in `/swaggerDocs`
and `/redoc` automatically.

## Templates

| Key | Category | Notes |
| --- | --- | --- |
| `welcome` | Account | New account created |
| `verify-email` | Account | Address confirmation link |
| `account-approved` | Account | Approve / reject decision, matches `User.approvalStatus` |
| `staff-invite` | Account | Invite to an organisation |
| `password-reset` | Authentication | Matches the existing `/api/v1/auth` flow |
| `otp` | Authentication | Matches the existing verify-pin flow |
| `password-expiry-reminder` | Authentication | Pairs with `checkPasswordExpiry` middleware |
| `patient-alert` | Monitoring | Fall / inactivity alerts, severity colour-coded |
| `task-assigned` | Care | Matches the `Task` model |
| `care-plan-updated` | Care | Matches the `CarePlan` model |
| `daily-report` | Care | Matches the `DailyReport` model |
| `custom-message` | Testing | Free-form subject and body in the Guardian layout |
| `render-check` | Testing | Exercises every layout component at once |

To add one, append an entry to `TEMPLATES` in `src/templates/emailTemplates.js`
with `fields` and a `build(data, config)` function. It will appear in the API,
in the test console form and in the "renders from its own sample" test with no
other changes.

## Local development with a mail catcher

```bash
docker compose -f docker-compose.mailpit.yaml up -d
```

```
EMAIL_PROVIDER=smtp
EMAIL_DRY_RUN=false
SMTP_HOST=localhost
SMTP_PORT=1025
```

Every message lands in a browsable inbox at http://localhost:8025 with HTML,
plain text, headers and raw source. Nothing leaves the machine, so real staff
and resident addresses cannot be reached by accident.

Because catchers use self-signed certificates, TLS certificate validation
defaults to **off** for loopback hosts (`localhost`, `127.0.0.1`, `mailpit`,
`mailhog`) and **on** for everything else. Disabling it for a remote host in
production is a validation error, not a warning.

## Safety model

Applied in order on every send:

1. **Address validation** — malformed recipients are rejected with a 400.
2. **Allowlist** — when `EMAIL_ALLOWLIST` is non-empty, non-matching recipients
   are blocked with a 403 and recorded as `blocked`. Matching is by full
   address or by domain.
3. **Dry run** — `EMAIL_DRY_RUN=true`, `EMAIL_PROVIDER=dryrun`, `NODE_ENV=test`
   or a per-request `dryRun: true` renders and records but never delivers.
4. **Provider** — only reached if all of the above pass.

Every attempt lands in the outbox with its status: `sent`, `dry-run`,
`blocked` or `failed`.

Templates escape all interpolated values, and `href` attributes accept only
`http(s):` and `mailto:` URLs, so a `javascript:` URL cannot reach the markup.

### Health information

Following the same guidance as the Health API module, the care-related
templates deliberately carry no clinical content — `patient-alert` and
`care-plan-updated` say that something needs attention and link to the secure
portal rather than including diagnoses, observations or medication detail.
Please keep that property when adding templates.

## Behaviour changes to be aware of

- **Email failures now surface.** The old `mailer.js` ended every send with
  `.catch(error => console.log(error))`, so `POST /api/v1/auth/forgot-password`
  returned `200 Password reset link sent` even when nothing was sent. It now
  rejects, and the existing `try/catch` in `userController.js` turns that into
  an error response. This is the correct behaviour but it will make previously
  invisible misconfiguration visible.
- **The sender address comes from `EMAIL_FROM`.** The old file hard-coded a
  MailerSend trial address (`MS_gEP33a@trial-….mlsender.net`). Set `EMAIL_FROM`
  to that value if you want to keep using the trial domain while you migrate.
- **`NODE_ENV=test` defaults to dry run**, so test suites cannot send real mail
  even if keys are present in the environment.

## Unrelated issue spotted

`src/controllers/userController.js:6` requires `../models/OTP`, but the file on
disk is `src/models/otp.js`. That resolves on Windows and macOS but throws
`MODULE_NOT_FOUND` on Linux — including the Docker image built from your
`Dockerfile`. Changing the require to `../models/otp` fixes it. Not related to
this module, but it will bite the moment the container is built.
