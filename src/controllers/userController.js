
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { sendResetEmail } = require('../services/emailService');
const { buildAuditSignature } = require('../services/signatureService');

exports.register = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ error: 'Email already registered' });

    const hash = await bcrypt.hash(password, 10);
    const user = new User({ name, email, password: hash, role });
    await user.save();

    res.status(201).json({ message: 'User registered', userId: user._id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email }).select('+password');
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ _id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1d' });
    res.status(200).json({ token });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    res.status(200).json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.updatePassword = async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const user = await User.findById(req.user._id).select('+password');
    if (!user) return res.status(404).json({ error: 'User not found' });

    const match = await bcrypt.compare(oldPassword, user.password);
    if (!match) return res.status(403).json({ error: 'Incorrect password' });

    user.password = await bcrypt.hash(newPassword, 10);
    user.lastPasswordChange = new Date();
    await user.save();

    res.status(200).json({ message: 'Password updated' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.requestPasswordReset = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(200).json({ message: 'If the email exists, a reset link was sent' });

    const token = jwt.sign({ _id: user._id }, process.env.JWT_SECRET, { expiresIn: '15m' });
    await sendResetEmail(email, user.name, token);
    res.status(200).json({ message: 'Reset link sent' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded._id);
    if (!user) return res.status(404).json({ error: 'Invalid token' });

    user.password = await bcrypt.hash(newPassword, 10);
    user.lastPasswordChange = new Date();
    await user.save();

    res.status(200).json({ message: 'Password reset successfully' });
  } catch (error) {
    res.status(400).json({ error: 'Invalid or expired token' });
  }
};
