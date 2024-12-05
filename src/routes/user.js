const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const verifyToken = require('../middleware/verifyToken');
const checkPasswordExpiry = require('../middleware/checkPasswordExpiry');
const { registerSchema, loginSchema, validationMiddleware } = require('../middleware/validationMiddleware');

// User Registration and Login Routes
router.post('/register', validationMiddleware(registerSchema), userController.registerUser);
router.post('/login', userController.login);
router.post('/send-pin', userController.sendOTP);
router.post('/verify-pin', userController.verifyOTP);

// User Password management Routes
router.post('/change-password', verifyToken, userController.changePassword);
router.post('/reset-password-request', userController.requestPasswordReset);
router.get('/reset-password', userController.renderPasswordResetPage);
router.post('/reset-password', userController.resetPassword);

router.get('/', verifyToken, async (req, res) => {
  try {
    const users = await User.find().select('-password_hash');
    res.status(200).json(users);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
