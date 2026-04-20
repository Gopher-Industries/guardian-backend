// src/routes/medicationReminderRoutes.js
const router = require('express').Router();
const verifyToken = require('../middleware/verifyToken');
const verifyRole = require('../middleware/verifyRole');
const c = require('../controllers/medicationReminderController');

// Create from a patient log (strict binding of entryReport + patient + createdBy)
router.post('/from-log/:logId', verifyToken, verifyRole(['nurse','caretaker','admin']), c.createFromLog);

// Create by payload (entryReportId + patientId required)
router.post('/', verifyToken, verifyRole(['nurse','caretaker','admin']), c.createReminder);

// List my reminders by status (createdBy = me)
router.get('/my', verifyToken, verifyRole(['nurse','caretaker','admin']), c.listMyReminders);

// Optional: global view with status filter can restrict to admin only
router.get('/', verifyToken, verifyRole(['admin']), c.getReminders);

// Read / Update / Delete
router.get('/:id', verifyToken, verifyRole(['nurse','caretaker','admin']), c.getReminderById);

router.patch('/:id', verifyToken, verifyRole(['nurse','caretaker','admin']), c.updateReminder);

router.delete('/:id', verifyToken, verifyRole(['nurse','caretaker','admin']), c.deleteReminder);

// Manual trigger ("Send Now")
router.post('/:id/trigger', verifyToken, verifyRole(['nurse','caretaker','admin']), c.triggerNow);

module.exports = router;
