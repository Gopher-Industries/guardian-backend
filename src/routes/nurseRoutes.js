const express = require('express');
const router = express.Router();
const nurseController = require('../controllers/nurseController');
const verifyToken = require('../middleware/verifyToken');


router.get('/profile', verifyToken, nurseController.getProfile);

module.exports = router;
