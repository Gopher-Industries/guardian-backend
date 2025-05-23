const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Role = require('../models/Role');
const OTP = require('../models/otp');
const path = require('path');

const Nurse = require('../models/Nurse');
const Pharmacist = require('../models/Pharmacist');
const Caretaker = require('../models/Caretaker');
const Patient = require('../models/Patient');

const { generateToken, validatePassword, hashPassword } = require('../services/authService');
const { generateOTP, storeOTP, verifyOTP } = require('../services/otpService');
const { sendResetEmail, sendOTPVerificationEmail } = require('../services/emailService');
const { formatUserProfile } = require('../services/profileService');

// Register user for any supported role
exports.registerUser = async (req, res) => {
  try {
    const { fullname, email, password, role, ahpra, age } = req.body;

    if (!fullname || !email || !password || !role) {
      return res.status(400).json({ error: 'fullname, email, password, and role are required' });
    }

    const roleLower = role.toLowerCase();
    let existing = await Nurse.findOne({ email }) || await Pharmacist.findOne({ email }) || await Caretaker.findOne({ email });

    if (existing) return res.status(400).json({ error: 'User already exists with this email' });

    const hashedPassword = await hashPassword(password);
    let newUser;

    if (roleLower === 'nurse') {
      if (!ahpra) return res.status(400).json({ error: 'AHPRA required for nurse' });
      newUser = new Nurse({ name: fullname, email, password: hashedPassword, ahpra });
    } else if (roleLower === 'pharmacist') {
      if (!ahpra) return res.status(400).json({ error: 'AHPRA required for pharmacist' });
      newUser = new Pharmacist({ name: fullname, email, password: hashedPassword, ahpra });
    } else if (roleLower === 'caretaker') {
      newUser = new Caretaker({ name: fullname, email, password: hashedPassword });
    } else if (roleLower === 'patient') {
      newUser = new Patient({ name: fullname, age: age || 0 });
    } else {
      return res.status(400).json({ error: 'Invalid role specified' });
    }

    await newUser.save();
    const token = generateToken({ _id: newUser._id, email: newUser.email, role: roleLower });

    res.status(201).json({
      message: 'Registration successful',
      user: { id: newUser._id, name: newUser.name, role: roleLower, email: newUser.email },
      token
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Login existing user
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await Nurse.findOne({ email }).select('+password') ||
                 await Pharmacist.findOne({ email }).select('+password') ||
                 await Caretaker.findOne({ email }).select('+password');

    if (!user) return res.status(404).json({ error: 'User not found' });

    if (user.failedLoginAttempts > 4)
      return res.status(403).json({ error: 'Account locked due to failed login attempts' });

    const valid = await validatePassword(password, user.password);
    if (!valid) {
      user.failedLoginAttempts += 1;
      await user.save();
      return res.status(401).json({ error: 'Incorrect email or password' });
    }

    user.failedLoginAttempts = 0;
    await user.save();
    const token = generateToken({ _id: user._id, email: user.email, role: user.role });

    res.status(200).json({ message: 'Login successful', user: await formatUserProfile(user), token });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Send OTP
exports.sendOTP = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await Nurse.findOne({ email }) || await Pharmacist.findOne({ email }) || await Caretaker.findOne({ email });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const otp = generateOTP();
    await storeOTP(email, otp);
    await sendOTPVerificationEmail(email, user.name.split(" ")[0], otp);

    res.status(200).json({ message: 'OTP sent to email' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Verify OTP
exports.verifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;
    const valid = await verifyOTP(email, otp);
    if (!valid) return res.status(400).json({ error: 'Invalid or expired OTP' });

    res.status(200).json({ message: 'OTP verified' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Change password
exports.changePassword = async (req, res) => {
  try {
    const { oldPassword, newPassword, confirmPassword } = req.body;
    if (!oldPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: 'New password and confirmation do not match' });
    }

    let user = await Nurse.findById(req.user._id).select('+password') ||
               await Pharmacist.findById(req.user._id).select('+password') ||
               await Caretaker.findById(req.user._id).select('+password');

    if (!user) return res.status(404).json({ error: 'User not found' });

    const valid = await validatePassword(oldPassword, user.password);
    if (!valid) return res.status(400).json({ error: 'Incorrect old password' });

    user.password = await hashPassword(newPassword);
    user.lastPasswordChange = Date.now();
    user.failedLoginAttempts = 0;
    await user.save();

    res.status(200).json({ message: 'Password changed successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Request password reset
exports.requestPasswordReset = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const user = await Nurse.findOne({ email }) ||
                 await Pharmacist.findOne({ email }) ||
                 await Caretaker.findOne({ email });

    // Respond with success regardless of user presence to prevent email probing
    if (!user) return res.status(200).json({ message: 'If that email exists, a reset link has been sent' });

    const token = jwt.sign({ _id: user._id }, process.env.JWT_SECRET, { expiresIn: '15m' });
    const firstName = user.name.split(" ")[0];
    await sendResetEmail(email, firstName, token);

    res.status(200).json({ message: 'Password reset link sent' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Render reset password page (form view)
exports.renderPasswordResetPage = (req, res) => {
  const { token } = req.query;

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded) return res.status(400).send('Invalid or expired token');

    res.render('reset-password', { token });
  } catch (error) {
    res.status(400).send('Invalid or expired token');
  }
};

// Reset password using reset token
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
    const user = await Nurse.findById(decoded._id) ||
                 await Pharmacist.findById(decoded._id) ||
                 await Caretaker.findById(decoded._id);

    if (!user) return res.status(400).json({ error: 'Invalid or expired token' });

    user.password = await hashPassword(newPassword);
    user.lastPasswordChange = Date.now();
    user.failedLoginAttempts = 0;
    await user.save();

    res.status(200).json({ message: 'Password has been updated successfully' });
  } catch (error) {
    res.status(400).json({ error: 'Invalid or expired token' });
  }
};

// Get current user profile
exports.getUserProfile = async (req, res) => {
  try {
    const user = await Nurse.findById(req.user._id) ||
                 await Pharmacist.findById(req.user._id) ||
                 await Caretaker.findById(req.user._id);

    if (!user) return res.status(404).json({ error: 'User not found' });

    res.status(200).json({ user: await formatUserProfile(user) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};