// routes/patientLogRoutes.js
const express = require('express');
const router = express.Router();

const verifyToken = require('../middleware/verifyToken');
const verifyRole = require('../middleware/verifyRole');
const controller = require('../controllers/patientLogController');

// Create patient log
router.post('/',verifyToken,verifyRole(['nurse', 'caretaker', 'doctor']),controller.createLog);

// Fetch logs by patient with pagination
router.get('/:patientId',verifyToken,verifyRole(['admin', 'nurse', 'caretaker', 'doctor']),controller.getLogsByPatient);

// Update patient log
router.put('/:id',verifyToken,verifyRole(['admin', 'nurse', 'caretaker', 'doctor']),controller.updateLog);

// Delete patient log
router.delete('/:id',verifyToken,verifyRole(['admin', 'nurse', 'caretaker', 'doctor']),controller.deleteLog);

module.exports = router;