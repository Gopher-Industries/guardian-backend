
const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const verifyToken = require('../middleware/verifyToken');

// Public routes
router.post('/register', userController.register);
router.post('/login', userController.login);
router.post('/request-password-reset', userController.requestPasswordReset);
router.post('/reset-password', userController.resetPassword);

// Authenticated user routes
router.get('/profile', verifyToken, userController.getProfile);
router.put('/password', verifyToken, userController.updatePassword);

module.exports = router;
