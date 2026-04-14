const express = require('express');
const router = express.Router();
const caretakerController = require('../controllers/caretakerController');
const verifyToken = require('../middleware/verifyToken');
const verifyRole = require('../middleware/verifyRole');


router.get('/profile', verifyToken, caretakerController.getProfile);
router.get('/tasks', verifyToken, caretakerController.getTasks);
router.put('/profile', verifyToken, caretakerController.updateProfile);
router.get('/', verifyToken, caretakerController.getAllCaretakers);
router.get('/dashboard-summary', verifyToken, verifyRole(['caretaker']), caretakerController.getDashboardSummary);

module.exports = router;
