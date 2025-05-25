
const express = require('express');
const router = express.Router();
const nurseController = require('../controllers/nurseController');
const verifyToken = require('../middleware/verifyToken');
const verifyRole = require('../middleware/verifyRole');

// Nurse-only routes
router.use(verifyToken, verifyRole('nurse'));

// Profile
router.get('/profile', nurseController.updateOwnProfile); // This could be GET or PUT depending on implementation
router.put('/profile', nurseController.updateOwnProfile);

// Patient
router.get('/patients/:patientId', nurseController.getPatientDetails);
router.put('/patients/:patientId', nurseController.updatePatientDetails);

// Medication
router.post('/patients/:patientId/medications', nurseController.createOrUpdateMedication);
router.get('/patients/:patientId/medications', nurseController.getMedicationRecord);

// Lab Tests
router.post('/patients/:patientId/lab-tests', nurseController.addLabTestResult);
router.get('/patients/:patientId/lab-tests', nurseController.getLabTestRecords);

// Observations
router.post('/patients/:patientId/observations', nurseController.createObservation);
router.get('/patients/:patientId/observations', nurseController.getObservations);

// Care Plan
router.post('/patients/:patientId/care-plan', nurseController.createOrUpdateCarePlan);
router.get('/patients/:patientId/care-plan', nurseController.getCarePlan);

// Tasks
router.post('/tasks', nurseController.createTask);
router.get('/tasks/my', nurseController.getMyTasks);

module.exports = router;

router.delete('/tasks/:taskId', nurseController.deleteTask);
