const express = require('express');
const router = express.Router();
// const UserRole = require('../models/UserRole');
const User = require('../models/User');
const verifyToken = require('../middleware/verifyToken');  // Optional: use this to require authentication

// Route to get all users along with their roles
router.get('/user-roles', verifyToken, async (req, res) => {
  try {
    // Find all users
    const users = await User.find().populate('role', 'name');

    // For each user, find their roles and attach them to the user object
    const usersWithRoles = users.map(user => {
      return {
        _id: user._id,
        username: user.username,
        email: user.email,
        roles: user.role ? [user.role.name] : []  // Extract role names
      };
    });

    res.status(200).json(usersWithRoles);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
