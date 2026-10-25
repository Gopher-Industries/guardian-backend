'use strict';

const express = require('express');
const router = express.Router();

const vitalController = require('../controllers/vitalController');
const verifyToken = require('../middleware/verifyToken');
const verifyRole = require('../middleware/verifyRole');

router.post(
  '/',
  verifyToken,
  verifyRole(['doctor', 'admin']),
  vitalController.createVital
);

router.get(
  '/patient/:patientId',
  verifyToken,
  verifyRole(['doctor', 'admin']),
  vitalController.getVitalsForPatient
);

router.get(
  '/:id',
  verifyToken,
  verifyRole(['doctor', 'admin']),
  vitalController.getVitalById
);

module.exports = router;
