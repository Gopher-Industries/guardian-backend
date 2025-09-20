const express = require('express');
const router = express.Router();
const Role = require('../models/Role');
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
    // Get Role _id for "nurse"
    const nurseRole = await Role.findOne({ name: 'nurse' }).lean();
    if (!nurseRole) {
      return res.status(500).json({ error: 'Role "nurse" not found' });
    }

    // Find all users whose role matches the nurse Role _id
    const nurses = await User.find({ role: nurseRole._id })
      .select('fullname email role created_at updated_at')
      .lean();

    res.status(200).json(nurses);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

  // Route to get all caretakers (admin-only)
  router.get('/caretakers', verifyToken, verifyRole(['admin']), async (req, res) => {
    try {
      // Get Role _id for "caretaker"
      const caretakerRole = await Role.findOne({ name: 'caretaker' }).lean();
      if (!caretakerRole) {
        return res.status(500).json({ error: 'Role "caretaker" not found' });
      }
  
      // Find all users whose role matches the caretaker Role _id
      const caretakers = await User.find({ role: caretakerRole._id })
        .select('fullname email role created_at updated_at')
        .lean();
  
      res.status(200).json(caretakers);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

// Patient Overview API
router.get('/patients/:patientId', verifyToken, verifyRole(['admin']), adminController.getPatientOverview);
// Support Tickets APIs
router.post('/support-ticket', verifyToken, adminController.createSupportTicket);
router.get('/support-tickets', verifyToken, verifyRole(['admin']), adminController.getSupportTickets);
router.put('/support-tickets/:ticketId', verifyToken, verifyRole(['admin']), adminController.updateSupportTicket);

// Task Management APIs
router.post('/tasks', verifyToken, verifyRole(['admin']), adminController.createTask);
router.put('/tasks/:taskId', verifyToken, verifyRole(['admin']), adminController.updateTask);
router.delete('/tasks/:taskId', verifyToken, verifyRole(['admin']), adminController.deleteTask);

module.exports = router;
