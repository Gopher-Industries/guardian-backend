const express = require('express');
const router = express.Router();

const verifyToken = require('../middleware/verifyToken');
const verifyRole = require('../middleware/verifyRole');

const adminStaffController = require('../controllers/adminStaffController');

// allow only logged-in admins on these routes
router.use(verifyToken, verifyRole(['admin']));

// list staff members (nurses/doctors) in org
router.get('/staff', adminStaffController.listStaff);

// add nurse/doctor to org staff
router.post('/staff', adminStaffController.addStaff);

// remove nurse/doctor from org staff (deactivate)
router.put('/staff/:id/deactivate', adminStaffController.deactivateStaff);

module.exports = router;
