const express = require('express');
const router = express.Router();
const UserRole = require('../models/UserRole');
const User = require('../models/User');
const verifyToken = require('../middleware/verifyToken');
const verifyRole = require('../middleware/verifyRole');
const adminController = require('../controllers/adminController');
const AuditLog = require('../models/AuditLog');

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

// Admin-only audit logs listing (read-only)
router.get('/audit-logs', verifyToken, verifyRole(['admin']), async (req, res) => {
  try {
    const {
      page = 1, limit = 50,
      category, action, severity,
      actor, targetModel, targetId,
    } = req.query;

    const q = {};
    if (category) q.category = category;
    if (action) q.action = action;
    if (severity) q.severity = severity;
    if (actor) q.actor = actor;
    if (targetModel) q.targetModel = targetModel;
    if (targetId) q.targetId = targetId;

    const safeLimit = Math.min(200, Math.max(1, Number(limit)));
    const safePage = Math.max(1, Number(page));
    const skip = (safePage - 1) * safeLimit;

    const [items, total] = await Promise.all([
      AuditLog.find(q).sort({ createdAt: -1 }).skip(skip).limit(safeLimit).lean(),
      AuditLog.countDocuments(q),
    ]);

    res.status(200).json({ page: safePage, limit: safeLimit, total, items });
  } catch (err) {
    res.status(500).json({ message: 'Error fetching audit logs', details: err.message });
  }
});

module.exports = router;
