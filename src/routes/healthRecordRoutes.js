const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/verifyToken');
const verifyRole = require('../middleware/verifyRole');

const {
  getHealthRecords,
  createHealthRecords,
  getPatientReport
} = require('../controllers/HealthRecordController');

// GET health records
router.get('/patient/:patientId/health-records', verifyToken, verifyRole(['admin', 'caretaker', 'doctor', 'nurse']), getHealthRecords);

// POST (create) health record
router.post('/patient/:patientId/health-record', verifyToken, verifyRole(['caretaker', 'nurse']), createHealthRecords);

// GET report
router.get('/patient/:patientId/report', verifyToken, verifyRole(['nurse']), getPatientReport);

module.exports = router;
