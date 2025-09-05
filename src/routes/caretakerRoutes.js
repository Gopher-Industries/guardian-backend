const express = require('express');
const router = express.Router();
const caretakerController = require('../controllers/caretakerController');
const verifyToken = require('../middleware/verifyToken');


router.get('/profile', verifyToken, caretakerController.getProfile);
router.get('/tasks', verifyToken, caretakerController.getTasks);

module.exports = router;
