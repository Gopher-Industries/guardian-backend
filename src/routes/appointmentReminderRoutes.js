const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/verifyToken');
const verifyRole = require('../middleware/verifyRole');
const { sendAppointmentReminders } = require('../services/appointmentReminderService');

/**
 * @swagger
 * /api/v1/appointment-reminders/send:
 *   post:
 *     summary: Send reminder emails for tomorrow's booked appointments
 *     tags: [Appointment Reminders]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Results for each appointment processed
 *       500:
 *         description: Server error
 */
router.post('/send', verifyToken, verifyRole(['admin']), async (req, res) => {
  try {
    const results = await sendAppointmentReminders();
    res.status(200).json({ results });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
