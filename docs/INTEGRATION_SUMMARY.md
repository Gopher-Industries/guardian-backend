# Guardian Email Module — Integration Summary

The Guardian Email Module is now integrated into `guardian-backend` as a
seamless, provider-independent mail service with **Mailpit** wired in as the
local mail catcher. This document records exactly what changed and how to run it.

## How to run (recommended: everything in Docker)

```bash
docker compose up --build
```

This starts three services:

| Service | Purpose | URL |
| --- | --- | --- |
| `app` | Guardian backend | http://localhost:3000 |
| `mongo` | Database | mongodb://localhost:27018 |
| `mailpit` | Local mail catcher | http://localhost:8025 (inbox) |

Every email the backend sends is captured by Mailpit — nothing leaves the
machine, so real resident or staff addresses can never be reached by accident.

Then:

1. Log in as an admin: `POST /api/v1/auth/login` and copy the bearer token.
2. Open the browser test console at
   http://localhost:3000/api/v1/email/test-console — paste the token, pick a
   template, **Load sample**, **Preview**, then **Send**.
3. Watch the message arrive in the Mailpit inbox at http://localhost:8025.

Running the server directly on your host instead of in Docker? In `.env`, switch
`MONGODB_URI` and `SMTP_HOST` to the commented "host alternative" lines
(`localhost:27018` and `localhost`) and run `npm start` with
`docker compose up -d mongo mailpit`.

## Default configuration

The integrated `.env` defaults to `EMAIL_PROVIDER=smtp` pointing at Mailpit, so
the send path is fully exercised out of the box. Switch `EMAIL_PROVIDER` to
`dryrun` (render + record, never deliver) or to a hosted provider
(`resend`, `brevo`, `mailersend`) by setting the matching API key.

## Files added

- `src/config/emailConfig.js` — environment resolution and validation
- `src/providers/` — `index.js` dispatcher plus `resend`, `brevo`, `mailersend`,
  `smtp` (nodemailer) and `dryRun` adapters (all lazily required)
- `src/templates/` — `baseTemplate.js` (Guardian-branded layout + escaping) and
  `emailTemplates.js` (13-template registry with field metadata)
- `src/services/emailService.js` — send / render / bulk interface
- `src/services/emailOutbox.js` — bounded in-memory record of every attempt
- `src/controllers/emailController.js`
- `src/routes/emailRoutes.js` — mounted at `/api/v1/email`, admin-only
- `src/views/email-test-console.ejs` — browser test console
- `src/test/emailFlow.cjs` (31 unit tests, no DB) and
  `src/test/emailRoutesFlow.cjs` (route tests, needs Mongo)
- `scripts/render-all-templates.js` — renders every template to `tmp/`
- `docs/EMAIL_MODULE.md`, `docs/INTEGRATION_PATCHES.md`, `docs/TESTING.md`
- `.env.email.example`, `docker-compose.mailpit.yaml` (standalone catcher,
  kept for reference)

## Files changed

- `src/utils/mailer.js` — **replaced** with a thin, backwards-compatible shim
  over `emailService`. The three original exports
  (`sendEmail`, `sendPasswordResetEmail`, `sendPinCodeVerificationEmail`) keep
  their signatures, so `userController.js` and the auth test mock work unchanged.
  The previous MailerSend-only file is preserved at
  `docs/mailer.legacy.mailersend.js.bak`.
- `src/server.js` — added `const emailRoutes = require('./routes/emailRoutes');`
  and `app.use('/api/v1/email', emailRoutes);`. Endpoints appear automatically
  in `/swaggerDocs` and `/redoc`.
- `src/test/helpers/testApp.cjs` — added the email route to `routeMounts` so
  integration tests can reach the endpoints.
- `src/controllers/userController.js` — fixed `require('../models/OTP')` →
  `require('../models/otp')`. The old casing resolves on Windows/macOS but throws
  `MODULE_NOT_FOUND` on Linux (including the Docker image), which would have
  stopped the container from booting.
- `package.json` — added `nodemailer`, `resend`, `@getbrevo/brevo` (runtime,
  lazily required) and `smtp-server` (dev, enables the live-SMTP test); added
  `test:email`, `test:email:routes`, `email:preview`, `email:catcher` scripts.
- `docker-compose.yaml` — added the `mailpit` service, made `app` depend on it,
  and added an anonymous `node_modules` volume so the bind mount no longer hides
  the image's installed dependencies.

## Behaviour changes to be aware of

- **Email failures now surface.** The old `mailer.js` swallowed errors with
  `.catch(console.log)`. Sends now reject on failure, and the existing
  `try/catch` in `userController.js` turns that into a proper error response.
  This makes previously invisible misconfiguration visible.
- **The sender address comes from `EMAIL_FROM`** rather than the hard-coded
  MailerSend trial address. Set `EMAIL_FROM` accordingly for your provider.
- **`NODE_ENV=test` forces dry run**, so test suites can never send real mail.

## Verification performed

- `npm run test:email` — **31/31 passing**, including template rendering,
  the safety model (validation, allowlist, dry-run), the outbox, a **live SMTP
  delivery** test (the same nodemailer→SMTP path Mailpit uses), and legacy
  mailer compatibility.
- All 13 templates render from their own sample data (`npm run email:preview`).
- Router mount + admin auth chain verified in-process (401 without a token,
  400 on a bad token) and the test-console EJS view renders `200 text/html`.
- `src/server.js`, `userController.js`, `emailController.js` and every provider
  load without error.

> The DB-backed suites (`emailRoutesFlow.cjs` and the pre-existing Mongo tests)
> were not run in the build sandbox because no MongoDB was reachable there. Run
> them locally with `docker compose up -d mongo` and `npm test`.
