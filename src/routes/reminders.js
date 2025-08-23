// routes/reminders.js
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/reminderController');


router.post('/reminders', ctrl.create);
router.get('/reminders/:id', ctrl.getById);
router.patch('/reminders/:id', ctrl.update);
router.delete('/reminders/:id', ctrl.cancel);
router.get('/patients/:patientId/reminders', ctrl.listByPatient);
router.get('/reminders/:id/attempts', ctrl.listAttempts);

router.post('/reminders/:id/trigger', ctrl.triggerNow);

module.exports = router;
