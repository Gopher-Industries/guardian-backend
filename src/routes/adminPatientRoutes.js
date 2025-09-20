const express = require('express');
const router = express.Router();

const verifyToken = require('../middleware/verifyToken');
const verifyRole = require('../middleware/verifyRole');

const adminPatientController = require('../controllers/adminPatientController');

// allow only logged-in admins on these routes
router.use(verifyToken, verifyRole(['admin']));

// create a new patient (caretaker required, nurse/doctor optional)
router.post('/patients', adminPatientController.createPatient);

// reassign nurse / caretaker / doctor for a patient
router.put('/patients/:id/assign', adminPatientController.reassign);

// list patients in org (with search + pagination + active filter)
router.get('/patients', adminPatientController.listPatients);

// get full overview of a patient (records, care plan, tasks, logs)
router.get('/patients/:id/overview', adminPatientController.patientOverview);

// soft delete / deactivate patient
router.delete('/patients/:id', adminPatientController.deactivatePatient);

module.exports = router;
