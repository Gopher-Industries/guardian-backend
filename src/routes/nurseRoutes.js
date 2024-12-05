const express = require('express');
const router = express.Router();
const nurseController = require('../controllers/nurseController');
const verifyToken = require('../middleware/verifyToken');
const { registerSchema, loginSchema, validationMiddleware } = require('../middleware/validationMiddleware');

// Nurse Registration and Login Routes
router.post('/register', validationMiddleware(registerSchema), nurseController.registerNurse);
router.post('/login', validationMiddleware(loginSchema), nurseController.loginNurse);

// Nurse Profile Routes
router.get('/profile', verifyToken, nurseController.getNurseProfile);
router.put('/profile', verifyToken, nurseController.updateProfile);

// Patient and Caretaker Routes
router.get('/patients', verifyToken, nurseController.getAssignedPatients);
router.get('/patient/:patientId', verifyToken, nurseController.getPatientDetails);
router.get('/caretakers/:patientId', verifyToken, nurseController.getAssignedCaretakersForPatient);
router.get('/caretaker/:caretakerId', verifyToken, nurseController.getCaretakerDetails);
router.get('/caretaker/:caretakerId/profile', verifyToken, nurseController.getCaretakerProfile);

// Task Routes
router.post('/tasks', verifyToken, nurseController.createTask);
router.put('/tasks/:taskId', verifyToken, nurseController.updateTask);
router.delete('/tasks/:taskId', verifyToken, nurseController.deleteTask);
router.post('/tasks/:taskId/approve', verifyToken, nurseController.approveTaskReport);

// Care Plan Routes
router.post('/care-plan/:patientId', verifyToken, nurseController.createOrUpdateCarePlan); // Create or Update Care Plan
router.get('/care-plan/:patientId', verifyToken, nurseController.getCarePlan); // Get Care Plan for a Patient


// Health Records Routes
router.get('/patient/:patientId/health-records', verifyToken, nurseController.getHealthRecords);
router.post('/patient/:patientId/health-record', verifyToken, nurseController.updateHealthRecords);
router.post('/vital-signs/:patientId/approve', verifyToken, nurseController.approveVitalSigns);

// Reports and Daily Records Routes
router.get('/reports', verifyToken, nurseController.getDailyReports);
router.get('/patient/:patientId/report', verifyToken, nurseController.getPatientReport);

// Nurse and Caretaker Communication Routes (Chat)
router.post('/chat/:caretakerId', verifyToken, nurseController.sendMessageToCaretaker);
router.get('/chat/:caretakerId/messages', verifyToken, nurseController.getChatMessages);

// Feedback for Caretaker
router.post('/caretaker/:caretakerId/feedback', verifyToken, nurseController.submitFeedbackForCaretaker);

// Fecth Assigned Paients API
router.get('/patients/assigned', verifyToken, nurseController.getAssignedPatients);

module.exports = router;
