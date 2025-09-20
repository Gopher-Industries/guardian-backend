const express = require('express');
const router = express.Router();

const patientController = require('../controllers/patientController');
const doctorController = require('../controllers/doctorController');
const verifyToken = require('../middleware/verifyToken');
const verifyRole = require('../middleware/verifyRole');
const upload = require('../middleware/multer');
const prescriptionController = require('../controllers/prescriptionController');


router.post(
    '/add',
    verifyToken,
    verifyRole(['caretaker']),
    upload.single('photo'),
    patientController.addPatient
  );
router.delete('/:patientId', verifyToken, patientController.deletePatient);

// Patients
router.post('/add', verifyToken, upload.single('profilePhoto'), patientController.addPatient);
router.delete('/:patientId', verifyToken, patientController.deletePatient);
router.put('/:patientId', verifyToken, upload.single('profilePhoto'), patientController.updatePatient);
router.get('/', verifyToken, patientController.getAllPatients);

// Assignments

router.post('/assign-nurse', verifyToken, verifyRole(['caretaker']), patientController.assignNurseToPatient);
router.post(
  '/:patientId/assign-doctor',
  verifyToken,
  verifyRole(['admin', 'caretaker']),
  doctorController.assignDoctorToPatient);

// Queries 
router.get('/assigned-patients', verifyToken, patientController.getAssignedPatients);
router.get('/activities', verifyToken, patientController.getPatientActivities);

// Get ONE patient by id 
router.get('/:patientId', verifyToken, patientController.getPatientDetails);

// Activities
router.post('/entryreport', verifyToken, verifyRole(['nurse']), patientController.logEntry);
router.delete('/entryreport/:entryId', verifyToken, patientController.deleteEntry);

// List prescriptions for a patient (sub-resource)
router.get('/:patientId/prescriptions',verifyToken,prescriptionController.listPrescriptionsForPatient);

module.exports = router;