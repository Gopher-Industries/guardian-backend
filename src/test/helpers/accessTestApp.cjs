/**
 * Guardian — access-control test app.
 *
 * Mounts the real routes, the real middleware and the real controllers against
 * the in-memory repository. No MongoDB, no listener, no rate limiter — so the
 * whole authorisation surface is exercised exactly as it ships, on any machine.
 *
 * @author   Graeme Thomas
 * @module   guardian-access-control
 * @version  1.1.0
 */

'use strict';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'gmproject';

const express = require('express');
const jwt = require('jsonwebtoken');

const { createMemoryRepository, newId } = require('../../access/accessRepository.memory');
const { createAccessControlService } = require('../../access/accessControlService');

/**
 * Build a populated world:
 *
 *   admin      unscoped, may authorise anyone for anyone
 *   drHouse    doctor, assigned to alice
 *   drGrey     doctor, assigned to bob
 *   nurseJoy   nurse, assigned to alice
 *   analyst    "system user" — capable of reading, related to nobody
 *   outsider   analyst with no grants at all
 */
function buildWorld(serviceOptions = {}) {
  const repository = createMemoryRepository();

  const ids = {
    admin: newId(),
    drHouse: newId(),
    drGrey: newId(),
    nurseJoy: newId(),
    analyst: newId(),
    outsider: newId(),
    caretaker: newId(),
    alice: newId(),
    bob: newId()
  };

  const users = {
    admin: repository.addUser({ id: ids.admin, fullname: 'System Admin', email: 'admin@guardian.test', roleName: 'admin' }),
    drHouse: repository.addUser({ id: ids.drHouse, fullname: 'Dr House', email: 'house@guardian.test', roleName: 'doctor' }),
    drGrey: repository.addUser({ id: ids.drGrey, fullname: 'Dr Grey', email: 'grey@guardian.test', roleName: 'doctor' }),
    nurseJoy: repository.addUser({ id: ids.nurseJoy, fullname: 'Nurse Joy', email: 'joy@guardian.test', roleName: 'nurse' }),
    analyst: repository.addUser({ id: ids.analyst, fullname: 'Data Analyst', email: 'analyst@guardian.test', roleName: 'analyst' }),
    outsider: repository.addUser({ id: ids.outsider, fullname: 'Unrelated Analyst', email: 'outsider@guardian.test', roleName: 'analyst' }),
    caretaker: repository.addUser({ id: ids.caretaker, fullname: 'Care Taker', email: 'care@guardian.test', roleName: 'caretaker' })
  };

  const patients = {
    alice: repository.addPatient({
      id: ids.alice,
      fullname: 'Alice Patient',
      caretaker: ids.caretaker,
      assignedNurses: [ids.nurseJoy],
      assignedDoctor: ids.drHouse
    }),
    bob: repository.addPatient({
      id: ids.bob,
      fullname: 'Bob Patient',
      caretaker: ids.caretaker,
      assignedNurses: [],
      assignedDoctor: ids.drGrey
    })
  };

  const service = createAccessControlService({
    repository,
    options: Object.assign(
      {
        // Strict mode: nothing but an explicit grant opens a patient record.
        allowRelationshipAccess: false,
        maskUnknownPatient: true,
        auditAllows: true,
        breakGlassMaxMinutes: 60
      },
      serviceOptions
    )
  });

  const app = express();
  app.use(express.json());
  app.locals.accessControl = service;
  app.use('/api/v1/access', require('../../routes/accessControlRoutes'));
  app.use((error, _req, res, _next) => {
    res.status(error.status || 500).json({ message: error.message || 'test app error' });
  });

  return { app, service, repository, users, patients, ids };
}

function tokenFor(user) {
  return jwt.sign(
    { _id: String(user.id), id: String(user.id), email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: '1h', algorithm: 'HS256' }
  );
}

function authHeader(user) {
  return `Bearer ${tokenFor(user)}`;
}

module.exports = { buildWorld, tokenFor, authHeader };
