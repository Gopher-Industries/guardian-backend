const express = require('express');
const router = express.Router();
const pharmacistController = require('../controllers/pharmacistController');
const verifyToken = require('../middleware/verifyToken');
const { registerSchema, loginSchema, validationMiddleware } = require('../middleware/validationMiddleware');

// Pharmacist Registration and Login Routes
router.post('/register', validationMiddleware(registerSchema), pharmacistController.registerPharmacist);
router.post('/login', validationMiddleware(loginSchema), pharmacistController.loginPharmacist);

// Pharmacist Profile Routes
router.get('/profile', verifyToken, pharmacistController.getPharmacistProfile);
router.put('/profile', verifyToken, pharmacistController.updateProfile);

// Patient and Caretaker Routes
router.get('/patients', verifyToken, pharmacistController.getAssignedPatients);
router.get('/patient/:patientId', verifyToken, pharmacistController.getPatientDetails);
router.get('/caretakers/:patientId', verifyToken, pharmacistController.getAssignedCaretakersForPatient);
router.get('/caretaker/:caretakerId', verifyToken, pharmacistController.getCaretakerDetails);
router.get('/caretaker/:caretakerId/profile', verifyToken, pharmacistController.getCaretakerProfile);

// Task Routes
router.post('/tasks', verifyToken, pharmacistController.createTask);
router.put('/tasks/:taskId', verifyToken, pharmacistController.updateTask);
router.delete('/tasks/:taskId', verifyToken, pharmacistController.deleteTask);
router.post('/tasks/:taskId/approve', verifyToken, pharmacistController.approveTaskReport);

// Care Plan Routes
router.post('/care-plan/:patientId', verifyToken, pharmacistController.createOrUpdateCarePlan); // Create or Update Care Plan
router.get('/care-plan/:patientId', verifyToken, pharmacistController.getCarePlan); // Get Care Plan for a Patient

// Health Records Routes
router.get('/patient/:patientId/health-records', verifyToken, pharmacistController.getHealthRecords);
router.post('/patient/:patientId/health-record', verifyToken, pharmacistController.updateHealthRecords);
router.post('/vital-signs/:patientId/approve', verifyToken, pharmacistController.approveVitalSigns);

// Laboratory Test Records Routes
router.get('/patient/:patientId/lab-records', verifyToken, pharmacistController.getLabTestRecords);
router.post('/patient/:patientId/lab-record', verifyToken, pharmacistController.updateLabTestRecords);

// Medication Records Routes
router.get('/patient/:patientId/medication-records', verifyToken, pharmacistController.getMedicationRecords);
router.post('/patient/:patientId/medication-record', verifyToken, pharmacistController.updateMedicationRecords);

// Reports and Daily Records Routes
router.get('/reports', verifyToken, pharmacistController.getDailyReports);
router.get('/patient/:patientId/report', verifyToken, pharmacistController.getPatientReport);

// Pharmacist and Caretaker Communication Routes (Chat)
router.post('/chat/:caretakerId', verifyToken, pharmacistController.sendMessageToCaretaker);
router.get('/chat/:caretakerId/messages', verifyToken, pharmacistController.getChatMessages);

// Feedback for Caretaker
router.post('/caretaker/:caretakerId/feedback', verifyToken, pharmacistController.submitFeedbackForCaretaker);

// Fetch Assigned Patients API
router.get('/patients/assigned', verifyToken, pharmacistController.getAssignedPatients);

module.exports = router;
