// routes/patient.js
const express = require('express');
const router = express.Router();

const patient = require('../controllers/patientController');
const verifyToken = require('../middleware/verifyToken');
const verifyRole = require('../middleware/verifyRole');
const attachContext = require('../middleware/context');
const upload = require('../middleware/multer');

router.use(verifyToken, attachContext);

// --- STATIC / NON-PARAM ROUTES FIRST ---
router.post(
  '/register',
  verifyRole(['nurse', 'caretaker']),
  upload.single('photo'),
  patient.registerPatientFreelance
);

router.get(
  '/assigned-patients',
  verifyRole(['admin', 'nurse', 'caretaker']),
  patient.getAssignedPatients
);

router.get(
  '/org',
  verifyRole(['admin', 'nurse', 'caretaker']),
  patient.listOrgPatients
);

router.post(
  '/assign-nurse',
  verifyRole(['admin', 'nurse', 'caretaker']),
  patient.assignNurseToPatient
);

router.post(
  '/assign-caretaker',
  verifyRole(['admin', 'nurse', 'caretaker']),
  patient.assignCaretakerToPatient
);

router.post(
  '/entryreport',
  verifyRole(['admin', 'nurse']),
  patient.logEntry
);

router.get(
  '/activities',
  verifyRole(['admin', 'nurse', 'caretaker']),
  patient.getPatientActivities
);

router.delete(
  '/entryreport/:entryId([0-9a-fA-F]{24})',
  verifyRole(['admin', 'nurse']),
  patient.deleteEntry
);

// --- PARAM ROUTES LAST (AND CONSTRAINED) ---
router.get(
  '/:patientId([0-9a-fA-F]{24})',
  verifyRole(['admin', 'nurse', 'caretaker']),
  patient.getPatientDetails
);

module.exports = router;
