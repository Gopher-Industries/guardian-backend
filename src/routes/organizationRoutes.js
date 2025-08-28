const express = require('express');
const router = express.Router();

const org = require('../controllers/organizationController');
const patient = require('../controllers/patientController'); // ⬅ add
const verifyToken = require('../middleware/verifyToken');
const verifyRole = require('../middleware/verifyRole');
const attachContext = require('../middleware/context');
const upload = require('../middleware/multer'); // ⬅ add

// All org routes need auth + context
router.use(verifyToken, attachContext);

// Create org (admin only)
router.post('/create', verifyRole(['admin']), org.createOrganization);

// Add/remove/approve members (admin only)
router.post('/add-member', verifyRole(['admin']), org.addMember);
router.patch('/member-status', verifyRole(['admin']), org.setMemberStatus);
router.post('/remove-member', verifyRole(['admin']), org.removeMember);

// View my org (admin/nurse/caretaker)
router.get('/me', verifyRole(['admin', 'nurse', 'caretaker']), org.getMyOrg);

// Org-admin patient registration (explicit org mode)
router.post(
  '/patients/register',
  verifyRole(['admin']),
  upload.single('photo'),            // optional; body can still be JSON if no file
  patient.registerPatientOrgAdmin
);

module.exports = router;
