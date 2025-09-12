// src/controllers/medicationReminderController.js
const MedicationReminder = require('../models/MedicationReminder');
const { DateTime } = require('luxon');
const dispatcher = require('../services/reminderDispatcher');

// Calculate the next run time for a reminder
function computeNextRunAt(reminder) {
  const tz = reminder.schedule.timezone || 'Australia/Melbourne';
  const now = DateTime.now().setZone(tz);
  const start = DateTime.fromJSDate(reminder.startDate).setZone(tz);
  const end = reminder.endDate ? DateTime.fromJSDate(reminder.endDate).setZone(tz) : null;

  if (!reminder.active) return null;

  // One-time reminder
  if (reminder.schedule.type === 'one_time') {
    const at = DateTime.fromJSDate(reminder.schedule.at).setZone(tz);
    if (at < now || (end && at > end)) return null;
    return at.toJSDate();
  }

  // Recurring reminder
  const days = reminder.schedule.daysOfWeek?.length ? reminder.schedule.daysOfWeek : [0,1,2,3,4,5,6];
  const times = reminder.schedule.timesOfDay?.length ? reminder.schedule.timesOfDay : ['08:00'];

  // Look ahead for the next 14 days
  for (let d = 0; d < 14; d++) {
    const day = now.plus({ days: d });
    const dow = (day.weekday % 7); // Luxon: 1=Mon..7=Sun, convert to 0-6
    if (!days.includes(dow)) continue;

    for (const t of times) {
      const [hh, mm] = t.split(':').map(Number);
      const candidate = day.set({ hour: hh, minute: mm, second: 0, millisecond: 0 });
      if (candidate < now) continue;
      if (candidate < start) continue;
      if (end && candidate > end) continue;
      return candidate.toJSDate();
    }
  }
  return null;
}

// Create a new reminder
exports.createReminder = async (req, res) => {
  try {
    const body = req.body;
    body.createdBy = req.user.id;
    const reminder = new MedicationReminder(body);
    reminder.nextRunAt = computeNextRunAt(reminder);
    await reminder.save();
    res.status(201).json(reminder);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};

// Get all reminders (optionally filtered by patient)
exports.getReminders = async (req, res) => {
  const { patient } = req.query;
  const query = {};
  if (patient) query.patient = patient;
  const data = await MedicationReminder.find(query).populate('patient createdBy', 'name _id');
  res.json(data);
};

// Get reminder by ID
exports.getReminderById = async (req, res) => {
  const r = await MedicationReminder.findById(req.params.id).populate('patient createdBy');
  if (!r) return res.status(404).json({ message: 'Not found' });
  res.json(r);
};

// Update reminder by ID
exports.updateReminder = async (req, res) => {
  const r = await MedicationReminder.findById(req.params.id);
  if (!r) return res.status(404).json({ message: 'Not found' });
  Object.assign(r, req.body);
  r.nextRunAt = computeNextRunAt(r);
  await r.save();
  res.json(r);
};

// Delete reminder by ID
exports.deleteReminder = async (req, res) => {
  await MedicationReminder.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
};

// Manually trigger a reminder
exports.triggerNow = async (req, res) => {
  const r = await MedicationReminder.findById(req.params.id);
  if (!r) return res.status(404).json({ message: 'Not found' });
  await dispatcher.dispatch(r);
  r.lastTriggeredAt = new Date();
  r.nextRunAt = computeNextRunAt(r);
  await r.save();
  res.json({ ok: true, nextRunAt: r.nextRunAt });
};

module.exports.computeNextRunAt = computeNextRunAt;
