const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const verifyToken = require('../middleware/verifyToken');
const checkPasswordExpiry = require('../middleware/checkPasswordExpiry');

router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'All fields (username, email, password) are required' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

   
    const newUser = new User({
      username: username,
      email: email,
      password_hash: hashedPassword,
      lastPasswordChange: Date.now() 
    });

    await newUser.save();

    const token = jwt.sign(
      { _id: newUser._id, username: newUser.username },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    res.status(201).json({ user: newUser, token });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});


router.post('/login', async (req, res) => {
  try {
    const user = await User.findOne({ email: req.body.email });
    if (!user) return res.status(400).json({ error: 'User not found' });

    const isValidPassword = await bcrypt.compare(req.body.password, user.password_hash);
    if (!isValidPassword) return res.status(400).json({ error: 'Invalid password' });

    const token = jwt.sign(
      { _id: user._id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    const currentDate = new Date();
    const lastChangeDate = new Date(user.lastPasswordChange); 

    const timeDifference = currentDate.getTime() - lastChangeDate.getTime(); 
    const daysSinceLastChange = Math.floor(timeDifference / (1000 * 60 * 60 * 24));
    const daysRemaining = 90 - daysSinceLastChange;

    const userResponse = {
      _id: user._id,
      username: user.username,
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
    const isValidPassword = await bcrypt.compare(oldPassword, user.password_hash);

    if (!isValidPassword) {
      return res.status(400).json({ error: 'Incorrect old password' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedNewPassword = await bcrypt.hash(newPassword, salt);

    user.password_hash = hashedNewPassword;
    user.lastPasswordChange = Date.now(); 
    await user.save();

    res.status(200).json({ message: 'Password changed successfully' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/', verifyToken, checkPasswordExpiry, async (req, res) => {
  try {
    const users = await User.find().select('-password_hash'); 
    res.status(200).json(users);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
