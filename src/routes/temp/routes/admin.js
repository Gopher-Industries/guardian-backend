
const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const verifyToken = require('../middleware/verifyToken');
const verifyRole = require('../middleware/verifyRole');

// Admin-only access
router.use(verifyToken, verifyRole('admin'));

// User approvals
router.put('/users/:userId/approve', adminController.approveUser);
router.put('/users/:userId/revoke', adminController.revokeUser);

// View all
router.get('/users', adminController.getAllUsers);
router.get('/patients', adminController.getAllPatients);
router.get('/nurses', adminController.getAllNurses);
router.get('/pharmacists', adminController.getAllPharmacists);
router.get('/caretakers', adminController.getAllCaretakers);

module.exports = router;
