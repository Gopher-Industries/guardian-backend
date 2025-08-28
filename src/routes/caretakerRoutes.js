const express = require('express');
const router = express.Router();
const caretakerController = require('../controllers/caretakerController');
const verifyToken = require('../middleware/verifyToken');

// Caretaker profile management
router.get('/profile', verifyToken, caretakerController.getProfile);
router.post('/profile', verifyToken, caretakerController.updateProfile);

module.exports = router;
