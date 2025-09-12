// src/routes/medicationReminderRoutes.js
const router = require('express').Router();
const verifyToken = require('../middleware/verifyToken');
const checkUserRole = require('./checkUserRole');
const c = require('../controllers/medicationReminderController');

// Create reminder
router.post('/', verifyToken, checkUserRole(['nurse','caretaker','admin']), c.createReminder);

// Get all reminders (or by patient)
router.get('/', verifyToken, checkUserRole(['nurse','caretaker','admin','patient']), c.getReminders);

// Get reminder by ID
router.get('/:id', verifyToken, checkUserRole(['nurse','caretaker','admin','patient']), c.getReminderById);

// Update reminder
router.patch('/:id', verifyToken, checkUserRole(['nurse','caretaker','admin']), c.updateReminder);

// Delete reminder
router.delete('/:id', verifyToken, checkUserRole(['nurse','caretaker','admin']), c.deleteReminder);

// Trigger reminder manually
router.post('/:id/trigger', verifyToken, checkUserRole(['nurse','caretaker','admin']), c.triggerNow);

module.exports = router;
