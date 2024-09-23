const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const verifyToken = require('../middleware/verifyToken');
const checkPasswordExpiry = require('../middleware/checkPasswordExpiry');
const { OTP, generateOTP } = require('../models/otp');
const { sendEmail, sendPinCodeVerification } = require('../utils/mailer');

router.post('/register', async (req, res) => {
  try {
    const { fullname, email, password, role } = req.body;

    if (!fullname || !email || !password || !role) {
      return res.status(400).json({ error: 'All fields (fullname, email, password, role) are required' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = new User({
      fullname: fullname,
      email: email,
      password_hash: hashedPassword,
      lastPasswordChange: Date.now()
    });

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
      role: role//roles.map(role => role.role_name)  // Extract role names
    };



    res.status(201).json({ user: userResponse, token });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});


router.post('/login', async (req, res) => {
  try {
    const user = await User.findOne({ email: req.body.email });
    if (!user) return res.status(400).json({ error: 'User not found' });

    const isValidPassword = await bcrypt.compare(req.body.password, user.password_hash);
    if (!isValidPassword) {
      user.failedLoginAttempts = (user.failedLoginAttempts !== null && user.failedLoginAttempts !== undefined) ? user.failedLoginAttempts + 1 : 1;
      await user.save();
      return res.status(400).json({ error: 'Incorrect email and password combination'});
    }

    if (user.failedLoginAttempts !== null && user.failedLoginAttempts !== undefined && user.failedLoginAttempts > 4) {
      return res.status(400).json({ error: 'Your account has been flagged and locked. Please reset your password' });
    }

    user.failedLoginAttempts = 0;
    await user.save();

    const token = jwt.sign(
      { _id: user._id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    const currentDate = new Date();
    const lastChangeDate = new Date(user.lastPasswordChange);

    const timeDifference = currentDate.getTime() - lastChangeDate.getTime();
    const daysSinceLastChange = Math.floor(timeDifference / (1000 * 60 * 60 * 24));
    const daysRemaining = 90 - daysSinceLastChange;

    const userResponse = {
      id: user._id,
      fullname: user.fullname,
      email: user.email,
      lastPasswordChange: user.lastPasswordChange,
      created_at: user.created_at,
      updated_at: user.updated_at
    };

    const response = { user: userResponse, token };

    if (daysRemaining <= 5) {
      response.passwordExpiryReminder = `Your password will expire in ${daysRemaining} days. Please change it soon.`;
    }

    res.status(200).json(response);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});


router.post('/change-password', verifyToken, async (req, res) => {
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

    const salt = await bcrypt.genSalt(10);
    const hashedNewPassword = await bcrypt.hash(newPassword, salt);

    user.password_hash = hashedNewPassword;
    user.lastPasswordChange = Date.now();
    user.failedLoginAttempts = 0;
    await user.save();

    res.status(200).json({ message: 'Password changed successfully' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});


router.post('/reset-password-request', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Please provide an email' });
    }

    const user = await User.findOne({ email });

    if (!user) {
      // TODO? Maybe we should consider returning a success message so attackers can't brute force to find valid email addresses
      return res.status(404).send({ message: 'User not found' });
    }

    const token = jwt.sign({ _id: user._id }, process.env.JWT_SECRET, { expiresIn: '15m' });

    // Construct reset URL
    const resetLink = `https://guardian-backend.railway.app/reset-password?token=${token}`;

    // Send the token to the user's email
    await sendEmail(
      email,
      'Password Reset Request',
      `Click the following link to reset your password: ${resetLink}`,
      `<p>Click the following link to reset your password: <a href="${resetLink}">Reset Password</a></p>`
    );

    res.status(200).json({ message: 'Password reset link sent' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});


router.get('/reset-password', (req, res) => {
  const { token } = req.query;

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!decoded) {
      return res.status(400).send('Invalid or expired token');
    }

    // If everything is valid, render the reset password form
    res.render('reset-password', { token });
  } catch (error) {
    res.status(400).send({ message: 'Invalid or expired token' });
  }
});


router.post('/reset-password', async (req, res) => {
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
      return res.status(400).send({ message: 'Invalid token or user not found.' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedNewPassword = await bcrypt.hash(newPassword, salt);

    user.password_hash = hashedNewPassword;
    user.lastPasswordChange = Date.now();
    user.failedLoginAttempts = 0;
    await user.save();

    res.status(200).json({ message: 'Password has been updated successfully' });
  } catch (error) {
    res.status(400).send({ message: 'Invalid or expired token' });
  }
});


router.post('/send-pin', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: 'Email is required' });
  }

  // Generate OTP
  const otp = generateOTP();

  try {
    // Remove any existing OTPs for this email (useful to avoid duplicates)
    await OTP.deleteMany({ email });

    // Create new OTP entry
    const otpEntry = new OTP({ email, otp });
    await otpEntry.save();

    // Send OTP email
    await sendPinCodeVerification(email, otp);
    res.status(200).json({ message: 'OTP sent to your email address' });
  } catch (error) {
    console.error('Error saving OTP or sending email:', err);
    res.status(500).json({ message: 'Error processing your request' });
  }
});


router.post('/verify-pin', async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({ message: 'Email and OTP are required' });
  }

  try {
    // Find the OTP record in the database
    const otpRecord = await OTP.findOne({ email, otp });

    // If no record is found, OTP is invalid or expired
    if (!otpRecord) {
      return res.status(400).json({ message: 'Invalid or expired OTP' });
    }

    // Remove the OTP entry after successful verification
    await OTP.deleteOne({ _id: otpRecord._id });

    res.status(200).json({ message: 'OTP verified successfully' });
  } catch (err) {
    console.error('Error verifying OTP:', err);
    res.status(500).json({ message: 'Error processing your request' });
  }
});

router.get('/', verifyToken, async (req, res) => {
  try {
    const users = await User.find().select('-password_hash');
    res.status(200).json(users);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
