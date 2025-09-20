// src/routes/doctor.js
const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

const verifyToken = require('../middleware/verifyToken');
const verifyRole = require('../middleware/verifyRole');
const doctorController = require('../controllers/doctorController');

// Optional: validate :doctorId early
router.param('doctorId', (req, res, next, id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: 'Invalid doctorId' });
  }
  next();
});

// GET /api/v1/doctors -> list all doctors (supports ?search=&page=&limit=)
router.get('/', verifyToken, doctorController.listDoctors);

// GET /api/v1/doctors/:doctorId/patients -> patients assigned to a doctor
router.get(
  '/:doctorId/patients',
  verifyToken,
  verifyRole(['admin', 'caretaker', 'doctor']),
  doctorController.listPatientsByDoctor
);

module.exports = router;
