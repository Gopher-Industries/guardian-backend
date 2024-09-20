const express = require('express');
const router = express.Router();
const UserRole = require('../models/UserRole');
const User = require('../models/User');
const verifyToken = require('../middleware/verifyToken');
const verifyRole = require('../middleware/verifyRole');

// Example route protected by role (only admins can access)
router.post('/admin/approve-nurse/:nurseId', verifyToken, verifyRole(['admin']), async (req, res) => {
  try {
    const nurseId = req.params.nurseId;
    // Logic for approving the nurse goes here
    res.status(200).json({ message: `Nurse with ID ${nurseId} approved` });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Route to get all nurses (admin-only)
router.get('/nurses', verifyToken, verifyRole(['admin']), async (req, res) => {
    try {
      // Find all nurses by looking up the UserRole model
      const nurseRoles = await UserRole.find({ role_name: 'nurse' });
      
      // Extract the user IDs of all nurses
      const nurseIds = nurseRoles.map(role => role.user_id);
  
      // Find all nurse user details using their IDs
      const nurses = await User.find({ _id: { $in: nurseIds } });
  
      res.status(200).json(nurses);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // Route to get all caretakers (admin-only)
router.get('/caretakers', verifyToken, verifyRole(['admin']), async (req, res) => {
    try {
      // Find all caretakers by looking up the UserRole model
      const caretakerRoles = await UserRole.find({ role_name: 'caretaker' });
  
      // Extract the user IDs of all caretakers
      const caretakerIds = caretakerRoles.map(role => role.user_id);
  
      // Find all caretaker user details using their IDs
      const caretakers = await User.find({ _id: { $in: caretakerIds } });
  
      res.status(200).json(caretakers);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

module.exports = router;
