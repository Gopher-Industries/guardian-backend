const express = require('express');
const router = express.Router();
const pharmacistController = require('../controllers/pharmacistController');
const verifyToken = require('../middleware/verifyToken');
const verifyAssignedPatientAccess = require('../middleware/verifyAssignedPatientAccess');
const {
  registerSchema,
  loginSchema,
  medicationRecordSchema,
  labTestRecordSchema,
  validationMiddleware
} = require('../middleware/validationMiddleware');

// Auth
router.post('/register', validationMiddleware(registerSchema), pharmacistController.registerPharmacist);
router.post('/login', validationMiddleware(loginSchema), pharmacistController.loginPharmacist);

// Profile
router.get('/profile', verifyToken, pharmacistController.getProfile);
router.put('/profile', verifyToken, pharmacistController.updateProfile);

// Patients & Caretakers
router.get('/patients', verifyToken, pharmacistController.getAssignedPatients);
router.get('/patient/:patientId', verifyToken, pharmacistController.getPatientDetails);
router.get('/caretakers/:patientId', verifyToken, pharmacistController.getAssignedCaretakersForPatient);
router.get('/caretaker/:caretakerId/profile', verifyToken, pharmacistController.getCaretakerProfile);

// Nurse Observations
router.get(
  '/patient/:patientId/nurse-observations',
  verifyToken,
  verifyAssignedPatientAccess,
  pharmacistController.getObservations
);

// Lab Records
router.get(
  '/patient/:patientId/lab-records',
  verifyToken,
  verifyAssignedPatientAccess,
  pharmacistController.getLabTestRecords
);
router.post(
  '/patient/:patientId/lab-record',
  verifyToken,
  verifyAssignedPatientAccess,
  validationMiddleware(labTestRecordSchema),
  pharmacistController.updateLabTestRecords
);

// Medication Records
router.get(
  '/patient/:patientId/medication-records',
  verifyToken,
  verifyAssignedPatientAccess,
  pharmacistController.getMedicationRecords
);
router.post(
  '/patient/:patientId/medication-record',
  verifyToken,
  verifyAssignedPatientAccess,
  validationMiddleware(medicationRecordSchema),
  pharmacistController.updateMedicationRecords
);

// Tasks
router.post('/tasks', verifyToken, pharmacistController.createTask);
router.put('/tasks/:taskId', verifyToken, pharmacistController.updateTask);
router.delete('/tasks/:taskId', verifyToken, pharmacistController.deleteTask);

// Care Plan
router.post('/care-plan/:patientId', verifyToken, pharmacistController.createOrUpdateCarePlan);
router.get('/care-plan/:patientId', verifyToken, pharmacistController.getCarePlan);

// Reports
router.get('/reports', verifyToken, pharmacistController.getDailyReports);
router.get(
  '/patient/:patientId/report',
  verifyToken,
  verifyAssignedPatientAccess,
  pharmacistController.getPatientReport
);

// Messaging
router.post('/message/:caretakerId', verifyToken, pharmacistController.sendMessage);
router.get('/message/:caretakerId/messages', verifyToken, pharmacistController.getMessages);

module.exports = router;
