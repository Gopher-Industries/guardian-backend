process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'gmproject';

const express = require('express');
const cors = require('cors');

function createTestApp() {
  const app = express();

  app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'] }));
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());

  // Mount the real route modules but avoid importing src/server.js.
  // This keeps tests isolated from the production server listener and config/db.js side effects.
  app.use('/api/v1/auth', require('../../routes/user'));
  app.use('/api/v1/patients', require('../../routes/patientRoutes'));
  app.use('/api/v1/notifications', require('../../routes/notifications'));
  app.use('/api/v1/admin', require('../../routes/admin'));
  app.use('/api/v1/admin', require('../../routes/adminStaffRoutes'));
  app.use('/api/v1/admin', require('../../routes/adminPatientRoutes'));
  app.use('/api/v1/orgs', require('../../routes/orgRoutes'));

  app.use((error, _req, res, _next) => {
    res.status(error.status || 500).json({
      message: error.message || 'Unexpected test app error',
    });
  });

  return app;
}

module.exports = createTestApp;
