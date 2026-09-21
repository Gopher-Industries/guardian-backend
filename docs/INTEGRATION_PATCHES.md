# Integration patches

Two small edits to existing files. Everything else is a new file.

## 1. `src/server.js`

Add the require alongside the other route requires (after `resourceRoutes`):

```js
const resourceRoutes = require('./routes/resourceRoutes');
const emailRoutes = require('./routes/emailRoutes');          // <-- add
```

Add the mount alongside the other `app.use` calls:

```js
app.use('/api/v1/resources', resourceRoutes);
app.use('/api/v1/email', emailRoutes);                        // <-- add
```

No other change is needed — `app.set('view engine', 'ejs')` and
`app.set('views', …)` are already configured above, which is what the test
console renders through. The Swagger `apis` glob already includes
`./src/routes/*.js`, so the new endpoints appear in `/swaggerDocs` and `/redoc`
with no further work.

## 2. `src/test/helpers/testApp.cjs` (optional)

Add to the `routeMounts` array so integration tests can reach the endpoints:

```js
    ['/api/v1/orgs', '../../routes/orgRoutes'],
    ['/api/v1/resources', '../../routes/resourceRoutes'],
    ['/api/v1/email', '../../routes/emailRoutes'],             // <-- add
  ];
```

Note that `createTestApp()` does not configure a view engine, so
`GET /api/v1/email/test-console` returns 500 there by design. Every other
endpoint works normally.

## 3. `package.json` (optional)

Provider SDKs are lazily required, so you only need the ones you actually use:

```bash
npm install nodemailer                  # smtp (local catcher / relay)
npm install resend @getbrevo/brevo      # hosted API providers
npm install --save-dev smtp-server      # optional: enables the live SMTP test
```

Convenience scripts:

```json
"test:email":        "NODE_ENV=test mocha 'src/test/emailFlow.cjs' --exit",
"test:email:routes": "NODE_ENV=test mocha 'src/test/emailRoutesFlow.cjs' --exit",
"email:preview":     "node scripts/render-all-templates.js",
"email:catcher":     "docker compose -f docker-compose.mailpit.yaml up -d"
```

## 4. `scripts/` and `docker-compose.mailpit.yaml`

Copy `scripts/render-all-templates.js` to `guardian-backend/scripts/` and
`docker-compose.mailpit.yaml` to the project root. Add `tmp/` to `.gitignore`
if you do not want the rendered previews committed.

## Verification

```bash
# 1. Unit tests — no MongoDB, no API keys needed
npx mocha 'src/test/emailFlow.cjs' --exit

# 2. Start the server
npm start

# 3. Log in as an admin and copy the token
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.com","password":"..."}'

# 4. Confirm the configuration is valid
curl http://localhost:3000/api/v1/email/config \
  -H "Authorization: Bearer $TOKEN"

# 5. Dry-run send
curl -X POST http://localhost:3000/api/v1/email/send \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"template":"patient-alert","dryRun":true,
       "data":{"to":"you@example.com","name":"Alex",
               "patientName":"Margaret Doyle","alertType":"Fall detected",
               "severity":"critical","location":"Room 12, East Wing"}}'

# 6. Read it back
curl http://localhost:3000/api/v1/email/outbox \
  -H "Authorization: Bearer $TOKEN"

# 7. Optional: local catcher with a real inbox at http://localhost:8025
docker compose -f docker-compose.mailpit.yaml up -d
# then set EMAIL_PROVIDER=smtp, SMTP_HOST=localhost, SMTP_PORT=1025
curl -X POST http://localhost:3000/api/v1/email/verify-connection \
  -H "Authorization: Bearer $TOKEN"
```

Then open `http://localhost:3000/api/v1/email/test-console` for the browser UI.
