# Guardian email integration — changed files

This package contains ONLY the files added or amended relative to the
original guardian-backend, at their real paths. To apply, copy the contents
of this guardian-backend/ folder over your existing guardian-backend project
(merge/overwrite), then run `npm install` (new dependencies were added).

## Amended files (existed in the original, content changed) — 10

- .gitignore
- docker-compose.yaml
- package-lock.json
- package.json
- src/controllers/userController.js
- src/openapi.json
- src/server.js
- src/test/helpers/db.cjs
- src/test/helpers/testApp.cjs
- src/utils/mailer.js

## Added files (new) — 56

- .env
- .env.email.example
- GETTING_STARTED.md
- docker-compose.mailpit.yaml
- docs/BREVO_EMAIL_API.md
- docs/DEVELOPER_GUIDE.md
- docs/EMAIL_EXPLAINED_PLAIN_ENGLISH.md
- docs/EMAIL_IMPROVEMENTS.md
- docs/EMAIL_MODULE.md
- docs/EMAIL_PARAMETERS_AND_FLOWS.md
- docs/INTEGRATION_PATCHES.md
- docs/INTEGRATION_SUMMARY.md
- docs/LOCAL_TESTING.md
- docs/SENT_INBOX.md
- docs/TESTING.md
- docs/TESTING_AND_ROBUSTNESS.md
- docs/TESTING_EMAILS_SWAGGER_AND_BREVO.md
- docs/architecture/guardian-all-email-templates.html
- docs/architecture/guardian-architecture.html
- docs/architecture/guardian-architecture.mermaid
- docs/architecture/guardian-architecture.svg
- docs/architecture/guardian-email-swagger.html
- docs/architecture/guardian-sendflow.mermaid
- docs/architecture/guardian-sendflow.svg
- docs/mailer.legacy.mailersend.js.bak
- guardian-email-swagger.html
- guardian-postman-collection.json
- scripts/email-sandbox.js
- scripts/generate-openapi.js
- scripts/generate-postman.js
- scripts/render-all-templates.js
- scripts/send-brevo-test.js
- src/config/emailConfig.js
- src/config/swagger.js
- src/config/swaggerEmail.js
- src/controllers/emailController.js
- src/models/PatientSelfRegistration.js
- src/models/SentEmail.js
- src/providers/brevoProvider.js
- src/providers/dryRunProvider.js
- src/providers/index.js
- src/providers/mailersendProvider.js
- src/providers/resendProvider.js
- src/providers/smtpProvider.js
- src/routes/emailRoutes.js
- src/services/emailOutbox.js
- src/services/emailService.js
- src/services/sentInbox.js
- src/templates/baseTemplate.js
- src/templates/emailTemplates.js
- src/test/emailApiNoDb.cjs
- src/test/emailFlow.cjs
- src/test/emailRoutesFlow.cjs
- src/utils/datetime.js
- src/views/email-inbox.ejs
- src/views/email-test-console.ejs

See AMENDED_FILES.diff for the exact line changes to the amended files.
