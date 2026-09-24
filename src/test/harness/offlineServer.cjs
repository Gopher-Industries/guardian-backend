#!/usr/bin/env node
/**
 * Guardian — offline access-control server.
 *
 *   node src/test/harness/offlineServer.cjs
 *
 * Starts the real routes, middleware and controllers against the in-memory
 * repository, seeded with a small demo world. No MongoDB, no network, nothing
 * to configure. Use it to drive the administration console and the Swagger page
 * by hand, on a laptop with no database and no internet.
 *
 *   Console  http://localhost:3000/api/v1/access/console
 *   Swagger  open guardian-access-control-swagger.html in a browser
 *
 * Data lives in memory only and resets every restart.
 *
 * Environment:
 *   PORT                        default 3000 (matches the OpenAPI server URL)
 *   ACCESS_ALLOW_RELATIONSHIP   'true' to start in relationship mode
 *                               (default here is strict: explicit grants only)
 *
 * @author   Graeme Thomas
 * @module   guardian-access-control
 * @version  1.1.0
 */

'use strict';

process.env.NODE_ENV = process.env.NODE_ENV || 'development';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'gmproject';
process.env.ACCESS_DEMO_ROUTES = 'true';

const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');

const { createMemoryRepository, newId } = require('../../access/accessRepository.memory');
const { createAccessControlService } = require('../../access/accessControlService');

const PORT = Number(process.env.PORT || 3000);
const DEMO_PASSWORD = 'Password123!';
const STRICT = process.env.ACCESS_ALLOW_RELATIONSHIP !== 'true';

/* ------------------------------------------------------------------ *
 * Demo world
 * ------------------------------------------------------------------ */

const repository = createMemoryRepository();

const ids = {
  admin: newId(),
  drHouse: newId(),
  drGrey: newId(),
  nurseJoy: newId(),
  analyst: newId(),
  caretaker: newId(),
  alice: newId(),
  bob: newId(),
  chen: newId()
};

const PEOPLE = [
  ['admin', 'System Admin', 'admin@guardian.test', 'admin'],
  ['drHouse', 'Dr House', 'house@guardian.test', 'doctor'],
  ['drGrey', 'Dr Grey', 'grey@guardian.test', 'doctor'],
  ['nurseJoy', 'Nurse Joy', 'joy@guardian.test', 'nurse'],
  ['analyst', 'Data Analyst', 'analyst@guardian.test', 'analyst'],
  ['caretaker', 'Care Taker', 'care@guardian.test', 'caretaker']
];

PEOPLE.forEach(([key, fullname, email, roleName]) =>
  repository.addUser({ id: ids[key], fullname, email, roleName })
);

repository.addPatient({
  id: ids.alice,
  fullname: 'Alice Nguyen',
  dateOfBirth: '1941-03-12',
  caretaker: ids.caretaker,
  assignedNurses: [ids.nurseJoy],
  assignedDoctor: ids.drHouse
});
repository.addPatient({
  id: ids.bob,
  fullname: 'Bob Feltham',
  dateOfBirth: '1938-11-02',
  caretaker: ids.caretaker,
  assignedDoctor: ids.drGrey
});
repository.addPatient({
  id: ids.chen,
  fullname: 'Mei Chen',
  dateOfBirth: '1946-07-25',
  caretaker: ids.caretaker,
  assignedNurses: [ids.nurseJoy],
  assignedDoctor: ids.drHouse
});

const service = createAccessControlService({
  repository,
  options: {
    allowRelationshipAccess: !STRICT,
    maskUnknownPatient: true,
    auditAllows: true,
    breakGlassMaxMinutes: 60
  }
});

/* ------------------------------------------------------------------ *
 * App
 * ------------------------------------------------------------------ */

function signFor(user) {
  return jwt.sign(
    { _id: String(user.id), id: String(user.id), email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: '12h', algorithm: 'HS256' }
  );
}

const app = express();

app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization']
  })
);
app.use(express.json());

app.locals.accessControl = service;

/**
 * Stand-in for the real POST /api/v1/auth/login, so the console's sign-in form
 * works offline. Accepts the demo password for any seeded user.
 */
app.post('/api/v1/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  const users = await repository.listUsers({});
  const user = users.find((candidate) => candidate.email === String(email || '').toLowerCase().trim());

  if (!user || password !== DEMO_PASSWORD) {
    return res.status(401).json({ message: 'Invalid credentials (offline demo password is ' + DEMO_PASSWORD + ')' });
  }

  res.status(200).json({
    user: { _id: user.id, fullname: user.fullname, email: user.email, role: user.roleName },
    token: signFor(user)
  });
});

app.use('/api/v1/access', require('../../routes/accessControlRoutes'));

app.get('/', (_req, res) => res.redirect('/api/v1/access/console'));

app.use((error, _req, res, _next) => {
  res.status(error.status || 500).json({ message: error.message || 'Offline server error' });
});

/* ------------------------------------------------------------------ *
 * Boot
 * ------------------------------------------------------------------ */

/**
 * Only listen when invoked directly. The project's test script globs every
 * .cjs file under src/test, so mocha requires this file too — without this guard it
 * would bind a port during every CI run.
 */
function start() {
  return app.listen(PORT, () => {
    const line = '─'.repeat(78);
    console.log('\n' + line);
    console.log('  Guardian — offline access-control server (in-memory, no database)');
    console.log(line);
    console.log(`  Mode      : ${STRICT ? 'STRICT — only explicit grants open a record' : 'RELATIONSHIP — care relationships also grant access'}`);
    console.log(`  Console   : http://localhost:${PORT}/api/v1/access/console`);
    console.log(`  Password  : ${DEMO_PASSWORD}   (any demo user below)`);
    console.log(line);
    console.log('  Sign in as                              email');
    PEOPLE.forEach(([, fullname, email, roleName]) =>
      console.log(`  ${(fullname + ' (' + roleName + ')').padEnd(38)}${email}`)
    );
    console.log(line);
    console.log('  Patients');
    ['alice', 'bob', 'chen'].forEach((key) => {
      const patient = repository.store.patients.get(ids[key]);
      console.log(`  ${patient.fullname.padEnd(18)}${ids[key]}`);
    });
    console.log(line);
    console.log('  Bearer tokens (paste into the console, or Swagger Authorize):\n');
    PEOPLE.forEach(([key, fullname, , roleName]) => {
      console.log(`  ${fullname} (${roleName}):`);
      console.log(`  ${signFor(repository.store.users.get(ids[key]))}\n`);
    });
    console.log(line);
    console.log('  Data is in memory only and resets on restart. Ctrl-C to stop.');
    console.log(line + '\n');
  });
}

if (require.main === module) {
  start();
}

module.exports = { app, start, service, repository, ids };
