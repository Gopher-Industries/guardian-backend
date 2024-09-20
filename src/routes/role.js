const express = require('express');
const router = express.Router();
const UserRole = require('../models/UserRole');
const User = require('../models/User');

// Route to assign a role to a user
router.post('/assign-role', async (req, res) => {
  try {
    const { userId, role } = req.body;

    // Validate if the user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if the user already has a role assigned
    const existingRole = await UserRole.findOne({ user_id: userId });
    if (existingRole) {
      return res.status(400).json({ message: 'Role already assigned to this user' });
    }

    // Assign the role to the user by creating an entry in the UserRole model
    const userRole = new UserRole({
      user_id: userId,
      role_name: role  // Assign the role provided (e.g., 'admin', 'nurse', 'caretaker')
    });

    await userRole.save();

    res.status(201).json({ message: `Role '${role}' assigned to user ${userId}` });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
