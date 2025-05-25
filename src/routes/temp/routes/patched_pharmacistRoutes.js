
const express = require('express');
const router = express.Router();
const pharmacistController = require('../controllers/pharmacistController');
const verifyToken = require('../middleware/verifyToken');
const verifyRole = require('../middleware/verifyRole');

// Pharmacist-only access
router.use(verifyToken, verifyRole('pharmacist'));

// Profile
router.get('/profile', pharmacistController.updateOwnProfile);
router.put('/profile', pharmacistController.updateOwnProfile);

// Patient
router.get('/patients/:patientId', pharmacistController.getPatientDetails);
router.put('/patients/:patientId', pharmacistController.updatePatientDetails);

// Medication
router.post('/patients/:patientId/medications', pharmacistController.createOrUpdateMedication);
router.get('/patients/:patientId/medications', pharmacistController.getMedicationRecord);

// Lab Tests
router.post('/patients/:patientId/lab-tests', pharmacistController.addLabTestResult);
router.get('/patients/:patientId/lab-tests', pharmacistController.getLabTestRecords);

// Care Plan
router.post('/patients/:patientId/care-plan', pharmacistController.createOrUpdateCarePlan);
router.get('/patients/:patientId/care-plan', pharmacistController.getCarePlan);

// Tasks
router.post('/tasks', pharmacistController.createTask);
router.delete('/tasks/:taskId', pharmacistController.deleteTask);
router.get('/tasks/my', pharmacistController.getMyTasks);

module.exports = router;
