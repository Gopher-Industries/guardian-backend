process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'gmproject';

const express = require('express');
const cors = require('cors');

function safeRoute(path) {
  try {
    return require(path);
  } catch (error) {
    if (error.code === 'MODULE_NOT_FOUND') return null;
    throw error;
  }
}

function createTestApp() {
  const app = express();

  app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'] }));
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());

  // Mount the real route modules but avoid importing src/server.js.
  // This keeps tests isolated from the production listener, socket server and rate limiter.
  const routeMounts = [
    ['/api/v1/auth', '../../routes/user'],
    ['/api/v1/caretaker', '../../routes/caretakerRoutes'],
    ['/api/v1/nurse', '../../routes/nurseRoutes'],
    ['/api/v1/patient', '../../routes/healthRecordRoutes'],
    ['/api/v1/patients', '../../routes/patientRoutes'],
    ['/api/v1/wifi-csi', '../../routes/wifiCSI'],
    ['/api/v1/activity-recognition', '../../routes/activityRecognition'],
    ['/api/v1/alerts', '../../routes/alerts'],
    ['/api/v1/notifications', '../../routes/notifications'],
    ['/api/v1/patient-logs', '../../routes/patientLogRoutes'],
    ['/api/v1/doctors', '../../routes/doctor'],
    ['/api/v1/admin', '../../routes/admin'],
    ['/api/v1/prescriptions', '../../routes/prescriptionRoutes'],
    ['/api/v1/admin', '../../routes/adminStaffRoutes'],
    ['/api/v1/admin', '../../routes/adminPatientRoutes'],
    ['/api/v1/orgs', '../../routes/orgRoutes'],
    ['/api/v1/resources', '../../routes/resourceRoutes'],
  ];

  routeMounts.forEach(([mountPath, modulePath]) => {
    const router = safeRoute(modulePath);
    if (router) app.use(mountPath, router);
  });

  app.use((error, _req, res, _next) => {
    res.status(error.status || 500).json({
      message: error.message || 'Unexpected test app error',
    });
  });

  return app;
}

module.exports = createTestApp;
