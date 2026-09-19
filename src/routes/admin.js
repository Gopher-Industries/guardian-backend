const express = require('express');
const router = express.Router();
const Role = require('../models/Role');
const User = require('../models/User');
const verifyToken = require('../middleware/verifyToken');
const verifyRole = require('../middleware/verifyRole');
const adminController = require('../controllers/adminController');
const dailyOperationalReportController = require('../controllers/dailyOperationalReportController');



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
router.get('/patient-overview/:patientId', verifyToken, verifyRole(['admin']), adminController.getPatientOverview);
// Support Tickets APIs
router.post('/support-ticket', verifyToken, adminController.createSupportTicket);
router.get('/support-tickets', verifyToken, verifyRole(['admin']), adminController.getSupportTickets);
router.put('/support-tickets/:ticketId', verifyToken, verifyRole(['admin']), adminController.updateSupportTicket);

// Task Management APIs
router.post('/tasks', verifyToken, verifyRole(['admin']), adminController.createTask);
router.put('/tasks/:taskId', verifyToken, verifyRole(['admin']), adminController.updateTask);
router.delete('/tasks/:taskId', verifyToken, verifyRole(['admin']), adminController.deleteTask);

// Dashboard Summary API
router.get('/dashboard-summary', verifyToken, verifyRole(['admin']), adminController.getDashboardSummary);

/**
 * @swagger
 * /api/v1/admin/daily-reports/pdf:
 *   post:
 *     summary: Generate and save the daily operational report as a PDF
 *     description: Pulls task and alert metrics from the database. General notes and analytics notes are supplied by the caller. The authenticated admin and server clock are used for sign-off.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [generalNotes, analytics]
 *             properties:
 *               reportDate:
 *                 type: string
 *                 format: date
 *                 description: Date to report on; defaults to the server's current local date.
 *               generalNotes:
 *                 type: string
 *               analytics:
 *                 type: string
 *                 description: Analyst commentary to accompany the calculated comparison with the prior report.
 *     responses:
 *       201:
 *         description: PDF generated and saved under uploads/daily-reports
 *       400:
 *         description: Missing notes or invalid report date
 */
router.post('/daily-reports/pdf', verifyToken, verifyRole(['admin']), dailyOperationalReportController.generatePdf);

module.exports = router;
