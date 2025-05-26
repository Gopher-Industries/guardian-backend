const express = require('express');
const router = express.Router();
const patientController = require('../controllers/patientController');
const verifyToken = require('../middleware/verifyToken');
const verifyRole = require('../middleware/verifyRole');
const upload = require('../middleware/multer');

router.post('/add', verifyToken, upload.single('photo'), patientController.addPatient);
router.post('/assign-nurse', verifyToken, verifyRole(['caretaker']), patientController.assignNurseToPatient);
router.get('/assigned-patients', verifyToken, patientController.getAssignedPatients);
router.get('/', verifyToken, patientController.getPatientDetails);

router.post('/entryreport', verifyToken, verifyRole(['nurse']), patientController.logEntry);
router.get('/activities', verifyToken, patientController.getPatientActivities);
router.delete('/entryreport/{entryId}', verifyToken, patientController.deleteEntry);

module.exports = router;
