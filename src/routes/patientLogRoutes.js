// routes/patientLogRoutes.js
const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/verifyToken');
const verifyRole = require('../middleware/verifyRole');
const controller = require('../controllers/patientLogController');

// add log
router.post('/', verifyToken, verifyRole('nurse'), controller.createLog);

// get log
router.get('/:patientId', verifyToken, controller.getLogsByPatient);

// deleting log
router.delete('/:id', verifyToken, controller.deleteLog);

module.exports = router;
