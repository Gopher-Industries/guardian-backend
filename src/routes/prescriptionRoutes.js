// src/routes/prescriptionRoutes.js
'use strict';

const express = require('express');
const router = express.Router();

const prescriptionController = require('../controllers/prescriptionController');
const verifyToken = require('../middleware/verifyToken');
const verifyRole = require('../middleware/verifyRole');

// CREATE (doctor/admin only)
router.post(
  '/',
  verifyToken,
  verifyRole(['doctor', 'admin']),
  prescriptionController.createPrescription
);

// READ ONE (any authenticated user)
router.get(
  '/:id',
  verifyToken,
  prescriptionController.getPrescriptionById
);

// UPDATE (doctor/admin only)
router.patch(
  '/:id',
  verifyToken,
  verifyRole(['doctor', 'admin']),
  prescriptionController.updatePrescription
);

// ACTION: DISCONTINUE (doctor/admin only)
router.post(
  '/:id/discontinue',
  verifyToken,
  verifyRole(['doctor', 'admin']),
  prescriptionController.discontinuePrescription
);

// DELETE (doctor/admin only)
router.delete(
  '/:id',
  verifyToken,
  verifyRole(['doctor', 'admin']),
  prescriptionController.deletePrescription
);

module.exports = router;