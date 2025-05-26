const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Role = require('../models/Role');

const { OTP, generateOTP } = require('../models/OTP');
const { sendPasswordResetEmail, sendPinCodeVerificationEmail } = require('../utils/mailer');

/**
 * @swagger
 * /api/v1/auth/register:
 *   post:
 *     summary: Register a new user
 *     description: Registers a new user with the provided fullname, email, and password.
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fullname:
 *                 type: string
 *                 example: John Doe
 *               email:
 *                 type: string
 *                 example: johndoe@example.com
 *               password:
 *                 type: string
 *                 example: Password123
 *               role:
 *                 type: string
 *                 example: nurse
 *     responses:
 *       201:
 *         description: User registered successfully.
 *       400:
 *         description: Bad request. Could be due to missing fields or an invalid email/password.
 */
exports.registerUser = async (req, res) => {
  try {
    const { fullname, email, password, role } = req.body;

    if (!fullname || !email || !password) {
      return res.status(400).json({ error: 'All fields (fullname, email, password) are required' });
    }

    var userRole;
    if (role) {
      userRole = await Role.findOne({ name: role.toLowerCase() });
      if (!userRole) {
        return res.status(400).json({ error: role + ' is an invalid role' });
      }
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format.' });
    }

    // Check if the password is at least 6 characters long
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists with this email' });
    }

    const newUser = new User({
      fullname: fullname,
      email: email,
      password_hash: password
    });

    if (userRole) {
      newUser.role = userRole._id;
    }

    await newUser.save();

    const token = jwt.sign(
      { _id: newUser._id, email: newUser.email },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    const userResponse = {
      id: newUser._id,
      fullname: newUser.fullname,
      email: newUser.email,
    };

    if (userRole) {
      userResponse.role = userRole.name;
    }

    res.status(201).json({ message: 'User registered successfully', user: userResponse, token });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};


/**
 * @swagger
 * /api/v1/auth/login:
 *   post:
 *     summary: Log in a user
 *     description: Authenticates a user with the provided email and password.
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 example: johndoe@example.com
 *               password:
 *                 type: string
 *                 example: Password123
 *     responses:
 *       200:
 *         description: Successful login with JWT token and user information.
 *       400:
 *         description: Bad request. Incorrect email/password combination or account locked.
 */
exports.login = async (req, res) => {
  try {
    const user = await User.findOne({ email: req.body.email });
    if (!user) return res.status(400).json({ error: 'User not found' });

    if (user.failedLoginAttempts !== null && user.failedLoginAttempts !== undefined && user.failedLoginAttempts > 4) {
      return res.status(400).json({ error: 'Your account has been flagged and locked. Please reset your password' });
    }

    const isValidPassword = await bcrypt.compare(req.body.password, user.password_hash);
    if (!isValidPassword) {
      user.failedLoginAttempts = (user.failedLoginAttempts !== null && user.failedLoginAttempts !== undefined) ? user.failedLoginAttempts + 1 : 1;
      await user.save();
      return res.status(400).json({ error: 'Incorrect email and password combination' });
    }

    user.failedLoginAttempts = 0;
    await user.save();

    const token = jwt.sign(
      { _id: user._id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    const currentDate = new Date();
    const lastChangeDate = new Date(user.lastPasswordChange);

    const timeDifference = currentDate.getTime() - lastChangeDate.getTime();
    const daysSinceLastChange = Math.floor(timeDifference / (1000 * 60 * 60 * 24));
    const daysRemaining = 90 - daysSinceLastChange;

    const userRole = await Role.findOne({ _id: user.role });

    const userResponse = {
      id: user._id,
      fullname: user.fullname,
      email: user.email,
      lastPasswordChange: user.lastPasswordChange,
      created_at: user.created_at,
      updated_at: user.updated_at,
      role: userRole.name,
      twoFactorRequired: userRole.name.toLowerCase() !== 'nurse' // Add twoFactorRequired field
    };

    const response = { user: userResponse, token };

    if (daysRemaining <= 5) {
      response.passwordExpiryReminder = `Your password will expire in ${daysRemaining} days. Please change it soon.`;
    }

    res.status(200).json(response);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};


/**
 * @swagger
 * /api/v1/auth/send-pin:
 *   post:
 *     summary: Send OTP for email verification
 *     description: Generates an OTP and sends it to the user's email for verification.
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 example: johndoe@example.com
 *     responses:
 *       200:
 *         description: OTP sent to your email address.
 *       400:
 *         description: Bad request. Email is required.
 *       500:
 *         description: Internal server error. Error processing the request.
 */
exports.sendOTP = async (req, res) => {
    // Temporary bypass for OTP
    return res.status(200).json({ message: 'OTP functionality is temporarily disabled for testing.' });

    // Original OTP logic (inactive due to the testing )
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  const user = await User.findOne({ email: email });
  if (!user) return res.status(400).json({ error: 'User not found' });

  // Generate OTP
  const otp = generateOTP();

  try {
    // Remove any existing OTPs for this email (useful to avoid duplicates)
    await OTP.deleteMany({ email });

    // Create new OTP entry
    const otpEntry = new OTP({ email, otp });
    await otpEntry.save();

    console.log("user full name is: " + user.fullname);
    console.log("user first name is: " + user.fullname.split(" ")[0]);
    console.log("user first[0] name is: " + user.fullname.split(" "));

    const firstName = user.fullname.split(" ")[0];

    // Send OTP email
    await sendPinCodeVerificationEmail(email, firstName, otp);
    res.status(200).json({ message: 'OTP sent to your email address' });
  } catch (error) {
    console.error('Error saving OTP or sending email:', error);
    res.status(500).json({ error: 'Error processing your request' });
  }
};


/**
 * @swagger
 * /api/v1/auth/verify-pin:
 *   post:
 *     summary: Verify OTP
 *     description: Verifies the OTP sent to the user's email address.
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 example: johndoe@example.com
 *               otp:
 *                 type: string
 *                 example: 123456
 *     responses:
 *       200:
 *         description: OTP verified successfully.
 *       400:
 *         description: Bad request. Email and OTP are required or invalid/expired OTP.
 *       500:
 *         description: Internal server error. Error processing the request.
 */
exports.verifyOTP = async (req, res) => {
    // Temporary bypass for OTP verification
    return res.status(200).json({ message: 'OTP verification bypassed for testing.' });

    // Original OTP verification logic (inactive due to testing)
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({ error: 'Email and OTP are required' });
  }

  try {
    // Find the OTP record in the database
    const otpRecord = await OTP.findOne({ email, otp });

    // If no record is found, OTP is invalid or expired
    if (!otpRecord) {
      return res.status(400).json({ error: 'Invalid or expired OTP' });
    }

    // Remove the OTP entry after successful verification
    await OTP.deleteOne({ _id: otpRecord._id });

    res.status(200).json({ message: 'OTP verified successfully' });
  } catch (error) {
    console.error('Error verifying OTP:', error);
    res.status(500).json({ error: 'Error processing your request' });
  }
};


/**
 * @swagger
 * /api/v1/auth/change-password:
 *   post:
 *     summary: Change a user's password
 *     description: Allows a user to change their password by providing the old and new passwords.
 *     tags:
 *       - Authentication
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               oldPassword:
 *                 type: string
 *                 example: OldPassword123
 *               newPassword:
 *                 type: string
 *                 example: NewPassword123
 *               confirmPassword:
 *                 type: string
 *                 example: NewPassword123
 *     responses:
 *       200:
 *         description: Password changed successfully.
 *       400:
 *         description: Bad request. Incorrect old password or new passwords don't match.
 */
exports.changePassword = async (req, res) => {
  try {
    const { oldPassword, newPassword, confirmPassword } = req.body;

    if (!oldPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: 'New password and confirmation do not match' });
    }

    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).send({ error: 'User not found' });
    }

    const isValidPassword = await bcrypt.compare(oldPassword, user.password_hash);

    if (!isValidPassword) {
      return res.status(400).json({ error: 'Incorrect old password' });
    }

    user.password_hash = newPassword;
    user.lastPasswordChange = Date.now();
    user.failedLoginAttempts = 0;
    await user.save();

    res.status(200).json({ message: 'Password changed successfully' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};


/**
 * @swagger
 * /api/v1/auth/reset-password-request:
 *   post:
 *     summary: Request a password reset
 *     description: Sends a password reset link to the user's email.
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 example: johndoe@example.com
 *     responses:
 *       200:
 *         description: Password reset link sent to the user's email.
 *       404:
 *         description: User not found.
 */
exports.requestPasswordReset = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Please provide an email' });
    }

    const user = await User.findOne({ email });

    if (!user) {
      // TODO? Maybe we should consider returning a success message so attackers can't brute force to find valid email addresses
      return res.status(404).send({ error: 'User not found' });
    }

    const token = jwt.sign({ _id: user._id }, process.env.JWT_SECRET, { expiresIn: '15m' });

    const firstName = user.fullname.split(" ")[0];

    // Send the token to the user's email
    await sendPasswordResetEmail(email, firstName, token);
    res.status(200).json({ message: 'Password reset link sent' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};


/**
 * @swagger
 * /api/v1/auth/reset-password:
 *   get:
 *     summary: Render password reset page
 *     description: Renders a page for resetting the password using a valid reset token.
 *     tags:
 *       - Authentication
 *     parameters:
 *       - name: token
 *         in: query
 *         required: true
 *         description: JWT reset token
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Renders the password reset page.
 *       400:
 *         description: Invalid or expired token.
 */
exports.renderPasswordResetPage = (req, res) => {
  const { token } = req.query;

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!decoded) {
      return res.status(400).send('Invalid or expired token');
    }

    // If everything is valid, render the reset password form
    res.render('reset-password', { token });
  } catch (error) {
    res.status(400).send({ error: 'Invalid or expired token' });
  }
};


/**
 * @swagger
 * /api/v1/auth/reset-password:
 *   post:
 *     summary: Reset password
 *     description: Resets the user's password using the reset token.
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               token:
 *                 type: string
 *                 example: "JWT_TOKEN_HERE"
 *               newPassword:
 *                 type: string
 *                 example: NewPassword123
 *               confirmPassword:
 *                 type: string
 *                 example: NewPassword123
 *     responses:
 *       200:
 *         description: Password has been updated successfully.
 *       400:
 *         description: Invalid or expired token, or passwords don't match.
 */
exports.resetPassword = async (req, res) => {
  const { token, newPassword, confirmPassword } = req.body;

  try {
    if (!newPassword || !confirmPassword) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: 'New password and confirmation do not match' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded._id);

    if (!user) {
      return res.status(400).send({ error: 'Invalid token or user not found.' });
    }

    user.password_hash = newPassword;
    user.lastPasswordChange = Date.now();
    user.failedLoginAttempts = 0;
    await user.save();

    res.status(200).json({ message: 'Password has been updated successfully' });
  } catch (error) {
    res.status(400).send({ error: 'Invalid or expired token' });
  }
};
