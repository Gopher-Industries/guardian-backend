
const express = require('express');
const router = express.Router();
const incidentController = require('../controllers/incidentController');
const verifyToken = require('../middleware/verifyToken');
const verifyRole = require('../middleware/verifyRole');

// Authenticated access
router.use(verifyToken);

// Nurse and Pharmacist access only for creating
router.post('/patients/:patientId/incidents', verifyRole(['nurse', 'pharmacist']), incidentController.createIncidentReport);

// All roles can view unresolved (assuming assigned access controlled elsewhere)
router.get('/patients/:patientId/incidents/unresolved', incidentController.getUnresolvedIncidents);

module.exports = router;
