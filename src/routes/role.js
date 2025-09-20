const express = require('express');
const router = express.Router();
const Role = require('../models/Role');
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
    if (user.role) {
      return res.status(400).json({ message: 'Role already assigned to this user' });
    }

    // Assign the role to the user 
    const roleDoc = await Role.findOne({ name: role.toLowerCase() });
    if (!roleDoc) {
      return res.status(400).json({ error: role + ' is an invalid role' });
    }

    user.role = roleDoc._id;
    await user.save();

    res.status(201).json({ message: `Role '${role}' assigned to user ${userId}` });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
