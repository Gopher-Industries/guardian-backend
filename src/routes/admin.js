const express = require('express');
const router = express.Router();
const UserRole = require('../models/UserRole');
const User = require('../models/User');
const verifyToken = require('../middleware/verifyToken');
const verifyRole = require('../middleware/verifyRole');
const adminController = require('../controllers/adminController');

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

  // Example route protected by role (only admins can access)
router.post('/admin/approve-pharmacist/:pharmacistId', verifyToken, verifyRole(['admin']), async (req, res) => {
  try {
    const pharmacistId = req.params.pharmacistId;
    // Logic for approving the nurse goes here
    res.status(200).json({ message: `Pharmacist with ID ${pharmacistId} approved` });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Route to get all pharmacists (admin-only)
router.get('/pharmacists', verifyToken, verifyRole(['admin']), async (req, res) => {
    try {
      // Find all pharmacists by looking up the UserRole model
      const pharmacistRoles = await UserRole.find({ role_name: 'pharmacist' });
      
      // Extract the user IDs of all pharmacists
      const pharmacistIds = pharmacistRoles.map(role => role.user_id);
  
      // Find all pharmacists user details using their IDs
      const pharmacists = await User.find({ _id: { $in: pharmacistIds } });
  
      res.status(200).json(pharmacists);
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

// Patient Overview API
router.get('/patients/:patientId', verifyToken, verifyRole(['admin']), adminController.getPatientOverview);
// Support Tickets APIs
router.post('/support-tickets', verifyToken, adminController.createSupportTicket);
router.get('/support-tickets', verifyToken, verifyRole(['admin']), adminController.getSupportTickets);
router.put('/support-tickets/:ticketId', verifyToken, verifyRole(['admin']), adminController.updateSupportTicket);

// Task Management APIs
router.post('/tasks', verifyToken, verifyRole(['admin']), adminController.createTask);
router.put('/tasks/:taskId', verifyToken, verifyRole(['admin']), adminController.updateTask);
router.delete('/tasks/:taskId', verifyToken, verifyRole(['admin']), adminController.deleteTask);

module.exports = router;
