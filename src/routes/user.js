const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const verifyToken = require('../middleware/verifyToken');
const checkPasswordExpiry = require('../middleware/checkPasswordExpiry');
const { registerSchema, loginSchema, validationMiddleware } = require('../middleware/validationMiddleware');


/**
 * @openapi
 * /api/v1/auth/register:
 *   post:
 *     tags:
 *       - Authentication
 *     summary: Register a new user
 *     description: >
 *       Creates a new user account. Role must be one of: admin, caretaker, nurse, doctor.
 *       No authentication required.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RegisterRequest'
 *           example:
 *             name: "John Doe"
 *             email: "john.doe@guardianmonitor.com"
 *             password: "SecurePass@123"
 *             role: "nurse"
 *             phone: "+61412345678"
 *             organizationId: "664f1c2e8b1a2c3d4e5f6a7b"
 *     responses:
 *       201:
 *         description: User registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessMessage'
 *             example:
 *               message: "User registered successfully."
 *       400:
 *         description: Validation error (missing fields, invalid email, weak password)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
 *             example:
 *               error: "Validation failed: email is required."
 *       409:
 *         description: Email already in use
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               error: "A user with this email already exists."
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/register', validationMiddleware(registerSchema), userController.registerUser);

/**
 * @openapi
 * /api/v1/auth/login:
 *   post:
 *     tags:
 *       - Authentication
 *     summary: Log in a user!
 *     description: >
 *       Authenticates a user and returns a JWT bearer token.
 *       Use the token in the Authorization header for all protected endpoints.
 *       No authentication required.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginRequest'
 *           example:
 *             email: "john.doe@guardianmonitor.com"
 *             password: "SecurePass@123"
 *     responses:
 *       200:
 *         description: Login successful — returns JWT token and user info
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/LoginResponse'
 *             example:
 *               token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *               user:
 *                 _id: "664f1c2e8b1a2c3d4e5f6a7b"
 *                 name: "John Doe"
 *                 email: "john.doe@guardianmonitor.com"
 *                 role: "nurse"
 *       400:
 *         description: Missing email or password
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
 *       401:
 *         description: Invalid credentials
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthorizedError'
 *             example:
 *               error: "Invalid email or password."
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/login', userController.login);

/**
 * @openapi
 * /api/v1/auth/send-pin:
 *   post:
 *     tags:
 *       - Authentication
 *     summary: Send OTP for email verification
 *     description: >
 *       Sends a one-time PIN (OTP) to the provided email address for verification purposes.
 *       No authentication required.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/OTPRequest'
 *           example:
 *             email: "john.doe@guardianmonitor.com"
 *     responses:
 *       200:
 *         description: OTP sent successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessMessage'
 *             example:
 *               message: "OTP sent to john.doe@guardianmonitor.com"
 *       400:
 *         description: Missing or invalid email
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
 *       404:
 *         description: Email not associated with any account
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/NotFoundError'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/send-pin', userController.sendOTP);

/**
 * @openapi
 * /api/v1/auth/verify-pin:
 *   post:
 *     tags:
 *       - Authentication
 *     summary: Verify OTP
 *     description: >
 *       Verifies the OTP sent to the user's email address.
 *       No authentication required.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/OTPVerifyRequest'
 *           example:
 *             email: "john.doe@guardianmonitor.com"
 *             otp: "847291"
 *     responses:
 *       200:
 *         description: OTP verified successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessMessage'
 *             example:
 *               message: "Email verified successfully."
 *       400:
 *         description: Invalid or expired OTP
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               error: "OTP is invalid or has expired."
 *       404:
 *         description: User not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/NotFoundError'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/verify-pin', userController.verifyOTP);

/**
 * @openapi
 * /api/v1/auth/change-password:
 *   post:
 *     tags:
 *       - Authentication
 *     summary: Change a user's password
 *     description: >
 *       Allows an authenticated user to change their own password.
 *       **Roles:** All authenticated users (admin, caretaker, nurse, doctor).
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ChangePasswordRequest'
 *           example:
 *             currentPassword: "OldPass@123"
 *             newPassword: "NewSecurePass@456"
 *     responses:
 *       200:
 *         description: Password changed successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessMessage'
 *             example:
 *               message: "Password updated successfully."
 *       400:
 *         description: Missing fields or new password does not meet requirements
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
 *       401:
 *         description: Unauthorized — missing or invalid token, or wrong current password
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthorizedError'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/change-password', verifyToken, userController.changePassword);

/**
 * @openapi
 * /api/v1/auth/reset-password-request:
 *   post:
 *     tags:
 *       - Authentication
 *     summary: Request a password reset
 *     description: >
 *       Sends a password reset link to the provided email address.
 *       No authentication required.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/OTPRequest'
 *           example:
 *             email: "john.doe@guardianmonitor.com"
 *     responses:
 *       200:
 *         description: Reset link sent successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessMessage'
 *             example:
 *               message: "Password reset link sent to john.doe@guardianmonitor.com"
 *       400:
 *         description: Missing or invalid email
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
 *       404:
 *         description: No account found with this email
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/NotFoundError'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/reset-password-request', userController.requestPasswordReset);

/**
 * @openapi
 * /api/v1/auth/reset-password:
 *   get:
 *     tags:
 *       - Authentication
 *     summary: Render password reset page
 *     description: >
 *       Renders the HTML password reset page using the reset token from the email link.
 *       No authentication required.
 *     parameters:
 *       - in: query
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: Password reset token received via email
 *         example: "reset-token-abc123xyz"
 *     responses:
 *       200:
 *         description: Password reset page rendered successfully
 *         content:
 *           text/html:
 *             schema:
 *               type: string
 *       400:
 *         description: Missing or invalid token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *   post:
 *     tags:
 *       - Authentication
 *     summary: Reset password
 *     description: >
 *       Resets the user's password using a valid reset token.
 *       No authentication required.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ResetPasswordRequest'
 *           example:
 *             token: "reset-token-abc123xyz"
 *             newPassword: "NewSecurePass@456"
 *     responses:
 *       200:
 *         description: Password reset successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessMessage'
 *             example:
 *               message: "Password has been reset successfully."
 *       400:
 *         description: Invalid or expired reset token, or weak password
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
 *             example:
 *               error: "Reset token is invalid or has expired."
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/reset-password', userController.renderPasswordResetPage);
router.post('/reset-password', userController.resetPassword);
/**
 * @swagger
 * /api/v1/auth/search-user:
 *   get:
 *     summary: Search users by name or user ID
 *     description: |
 *       Searches users using either a user ID or a name.
 *
 *       - If the search value exactly matches a user ID, the corresponding user is returned.
 *       - Otherwise, a case-insensitive name search is performed by matching one or more name terms.
 *
 *       Returns the matching user's ID and full name.
 *     tags:
 *       - Authentication
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         required: true
 *         schema:
 *           type: string
 *         description: |
 *           User ID or name to search for.
 *
 *           Examples:
 *           - 689f7d2a1b7c4f3d91ab1234
 *           - John
 *           - John Smith
 *     responses:
 *       200:
 *         description: User(s) found successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 count:
 *                   type: integer
 *                   example: 1
 *                 users:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       userId:
 *                         type: string
 *                         example: 689f7d2a1b7c4f3d91ab1234
 *                       fullname:
 *                         type: string
 *                         example: John Smith
 *       400:
 *         description: Search text is required.
 *       404:
 *         description: No users found.
 *       500:
 *         description: Internal server error.
 */
router.get('/search-user', verifyToken, userController.searchUser);
router.get('/', verifyToken, async (req, res) => {
  try {
    const users = await User.find().select('-password_hash');
    res.status(200).json(users);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
