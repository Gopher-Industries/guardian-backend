const express = require('express');
const router = express.Router();
const caretakerController = require('../controllers/caretakerController');
const dailyReportController = require('../controllers/dailyReportController');
const verifyToken = require('../middleware/verifyToken');
const verifyRole = require('../middleware/verifyRole');


router.get('/profile', verifyToken, caretakerController.getProfile);
router.get('/tasks', verifyToken, caretakerController.getTasks);
router.put('/profile', verifyToken, caretakerController.updateProfile);
router.get('/', verifyToken, caretakerController.getAllCaretakers);
router.post('/reports', verifyToken, verifyRole('caretaker'), dailyReportController.createReport);
router.get('/reports', verifyToken, verifyRole('caretaker'), dailyReportController.getReports);
router.get('/reports/patient/:patientId',verifyToken,verifyRole('caretaker', 'doctor', 'nurse'), caretakerController.getReportsByPatient);

module.exports = router;
