/**
 * Guardian Email Service — email-sandbox.js
 *
 * A standalone way to try the email API on your machine WITHOUT the full
 * application: no MongoDB, no authentication, and dry-run by default (nothing
 * is delivered). It mounts only the email routes and serves Swagger UI with a
 * working "Try it out".
 *
 *   node scripts/email-sandbox.js
 *   # then open http://localhost:4000/swaggerDocs
 *
 * Change the port with SANDBOX_PORT, or send for real by setting
 * EMAIL_PROVIDER=brevo and BREVO_API_KEY before running.
 *
 * Author: Graeme Thomas
 * Date:   2026-08-15
 */

process.env.NODE_ENV = process.env.NODE_ENV || 'development';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'sandbox';
process.env.EMAIL_PROVIDER = process.env.EMAIL_PROVIDER || 'dryrun';
process.env.EMAIL_TEST_CONSOLE_ENABLED = 'true';
process.env.EMAIL_INBOX_ENABLED = 'true';
// No MongoDB here: persistence auto-disables and the inbox falls back to memory.

const path = require('path');
const express = require('express');
const swaggerUi = require('swagger-ui-express');

// --- Stub the auth middleware so no token or database is required ----------
const verifyTokenPath = require.resolve('../src/middleware/verifyToken');
const verifyRolePath = require.resolve('../src/middleware/verifyRole');
require.cache[verifyTokenPath] = {
  id: verifyTokenPath, filename: verifyTokenPath, loaded: true,
  exports: (req, _res, next) => { req.user = { _id: 'sandbox-admin' }; next(); }
};
require.cache[verifyRolePath] = {
  id: verifyRolePath, filename: verifyRolePath, loaded: true,
  exports: () => (_req, _res, next) => next()
};

const emailRoutes = require('../src/routes/emailRoutes');
const { buildSwaggerSpec } = require('../src/config/swagger');

const PORT = Number(process.env.SANDBOX_PORT || 4000);

// Build a spec that contains ONLY the email endpoints, with auth stripped so
// "Try it out" works immediately (the sandbox needs no token).
function buildEmailOnlySpec() {
  const full = buildSwaggerSpec();
  const paths = {};
  for (const [p, ops] of Object.entries(full.paths || {})) {
    if (!p.startsWith('/api/v1/email')) continue;
    const cleaned = {};
    for (const [method, op] of Object.entries(ops)) {
      const copy = { ...op };
      delete copy.security; // no bearer needed in the sandbox
      cleaned[method] = copy;
    }
    paths[p] = cleaned;
  }
  return {
    openapi: '3.0.0',
    info: {
      title: 'Guardian Email API — sandbox',
      version: '1.0.0',
      description:
        'Standalone email sandbox: no database, no auth, dry-run by default. ' +
        'Use "Try it out" on any endpoint. Set EMAIL_PROVIDER=brevo + BREVO_API_KEY to send for real.'
    },
    servers: [{ url: `http://localhost:${PORT}` }],
    paths,
    security: []
  };
}

const spec = buildEmailOnlySpec();

const app = express();
app.use(express.json());
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'src', 'views'));

app.use('/swaggerDocs', swaggerUi.serve, swaggerUi.setup(spec, { explorer: true }));
app.get('/openapi.json', (_req, res) => res.json(spec));
app.use('/api/v1/email', emailRoutes);
app.get('/', (_req, res) => res.redirect('/swaggerDocs'));

// Only start listening when run directly (node scripts/email-sandbox.js).
// When required (e.g. by a test), the app is exported instead.
if (require.main === module) {
  const server = app.listen(PORT, () => {
    const line = '='.repeat(60);
    console.log(`\n${line}`);
    console.log('  Guardian email sandbox is RUNNING — keep this window open.');
    console.log('  (no database, no auth, dry-run by default)');
    console.log(line);
    console.log(`  >>> Open this in your browser:  http://localhost:${PORT}/swaggerDocs`);
    console.log('');
    console.log(`  Test console:  http://localhost:${PORT}/api/v1/email/test-console`);
    console.log(`  Sent inbox:    http://localhost:${PORT}/api/v1/email/inbox-view`);
    console.log(`  OpenAPI JSON:  http://localhost:${PORT}/openapi.json`);
    console.log(line);
    console.log('  On the console / inbox pages, paste ANY text as the token.');
    console.log('  Stop the server with Ctrl+C (the browser page will then stop working).\n');
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n[!] Port ${PORT} is already in use — something else is using it.`);
      console.error('    Start the sandbox on a different port, e.g.:');
      console.error('      Windows (Command Prompt):  set SANDBOX_PORT=4001 && npm run email:sandbox');
      console.error('      Windows (PowerShell):      $env:SANDBOX_PORT=4001; npm run email:sandbox');
      console.error('      macOS / Linux:             SANDBOX_PORT=4001 npm run email:sandbox');
      console.error('    Then open http://localhost:4001/swaggerDocs\n');
    } else {
      console.error('\n[!] Could not start the sandbox:', err.message, '\n');
    }
    process.exit(1);
  });
}

module.exports = app;
