// src/controllers/medicationReminderController.js
// CRUD + nurse/caretaker views + create from patient log + manual trigger.

const MedicationReminder = require('../models/MedicationReminder');
const PatientLog = require('../models/PatientLog');
const Notification = require('../models/Notification');
const dispatcher = require('../services/reminderDispatcher');
const { DateTime } = require('luxon');

// Ensure computeNextRunAt logic matches between controller and scheduler
function computeNextRunAt(rem) {
  const tz = rem.schedule?.timezone || 'Australia/Melbourne';
  const nowTz = DateTime.now().setZone(tz);

  // --- One-time reminders ---
  // If a one-time reminder has a scheduled "at" time:
  //   - If the time is still in the future, return it (in UTC).
  //   - If the time has already passed, return null (no next run).
  if (rem.schedule.type === 'one_time') {
    if (!rem.schedule.at) return null; // cannot schedule without a datetime
    const atTz = DateTime.fromJSDate(new Date(rem.schedule.at)).setZone(tz);
    return atTz > nowTz ? atTz.toUTC().toJSDate() : null;
  }

  // --- Recurring reminders ---
  // timesOfDay: array of "HH:mm" strings (default to ['08:00'])
  // daysOfWeek: array of allowed weekdays (0=Sunday..6=Saturday, default all days)
  const times = rem.schedule.timesOfDay?.length ? rem.schedule.timesOfDay : ['08:00'];
  const days = Array.isArray(rem.schedule.daysOfWeek) && rem.schedule.daysOfWeek.length
    ? rem.schedule.daysOfWeek
    : [0,1,2,3,4,5,6];

  // Start cursor: lastTriggeredAt (if exists) or now
  let cursor = rem.lastTriggeredAt
    ? DateTime.fromJSDate(rem.lastTriggeredAt).setZone(tz)
    : nowTz;

  // Search up to 8 weeks ahead for the next valid run
  for (let i = 0; i < 8 * 7; i++) {
    const day = cursor.plus({ days: i });

    // Skip if this weekday is not in the allowed set
    if (!days.includes(day.weekday % 7)) continue;

    // Check each time of day for this valid day
    for (const hhmm of times) {
      const [h, m] = hhmm.split(':').map(Number);
      const candidate = day.set({ hour: h, minute: m, second: 0, millisecond: 0 });

      // Return the first candidate strictly after "now"
      if (candidate > nowTz) return candidate.toUTC().toJSDate();
    }
  }

  // If nothing found in the next 8 weeks, return null
  return null;
}


/** Create reminder FROM a patient log: all three IDs are enforced (entryReport, patient, createdBy) */
exports.createFromLog = async (req, res) => {
  try {
    const { logId } = req.params;
    const log = await PatientLog.findById(logId).select('patient title description');
    if (!log) return res.status(404).json({ message: 'Patient log not found' });

    const {
      medicationName = `Medication for: ${log.title}`,
      dosage,
      instructions = log.description || 'Please follow care instructions',
      startDate = new Date(),
      endDate,
      schedule,                 // must include type
      notifyChannels = ['in_app']
    } = req.body || {};

    if (!schedule || !schedule.type) {
      return res.status(400).json({ message: 'schedule.type is required' });
    }

    const reminder = new MedicationReminder({
      entryReport: log._id,          // REQUIRED (patient log id)
      patient: log.patient,          // REQUIRED (patient id), validated against log in model
      createdBy: req.user._id,       // REQUIRED (user id of nurse/caretaker)
      medicationName,
      dosage,
      instructions,
      startDate,
      endDate,
      schedule,
      notifyChannels,
      active: true
    });

    reminder.nextRunAt = computeNextRunAt(reminder);
    await reminder.save();
    res.status(201).json(reminder);
  } catch (err) {
    res.status(400).json({ message: 'Failed to create reminder from log', details: err.message });
  }
};

/** Create reminder by providing entryReport + patient explicitly (manual path) */
exports.createReminder = async (req, res) => {
  try {
    const {
      entryReportId,               // REQUIRED
      patientId,                   // REQUIRED
      medicationName,
      dosage,
      instructions,
      startDate,
      endDate,
      schedule,                    // REQUIRED with type
      notifyChannels = ['in_app']
    } = req.body;

    if (!entryReportId || !patientId) {
      return res.status(400).json({ message: 'entryReportId and patientId are required' });
    }
    if (!schedule || !schedule.type) {
      return res.status(400).json({ message: 'schedule.type is required' });
    }

    // Model pre-validate will ensure patient matches the log.patient.
    const reminder = new MedicationReminder({
      entryReport: entryReportId,
      patient: patientId,
      createdBy: req.user._id,
      medicationName,
      dosage,
      instructions,
      startDate: startDate || new Date(),
      endDate,
      schedule,
      notifyChannels,
      active: true
    });

    reminder.nextRunAt = computeNextRunAt(reminder);
    await reminder.save();
    res.status(201).json(reminder);
  } catch (err) {
    res.status(400).json({ message: 'Failed to create reminder', details: err.message });
  }
};

/** List ONLY my reminders (createdBy = me) with status filter */
exports.listMyReminders = async (req, res) => {
  try {
    const { status = 'all', limit = 50 } = req.query;
    const now = new Date();

    const query = { createdBy: req.user._id };
    if (status === 'pending') {
      query.active = true;
      query.nextRunAt = { $gt: now };
    } else if (status === 'sent') {
      query.lastTriggeredAt = { $ne: null };
    }

    const items = await MedicationReminder.find(query)
      .sort({ nextRunAt: 1, updatedAt: -1 })
      .limit(Math.min(Number(limit) || 50, 200))
      .populate('patient', 'fullname')
      .populate('entryReport', 'title');

    res.json({ count: items.length, items });
  } catch (err) {
    res.status(400).json({ message: 'Failed to load my reminders', details: err.message });
  }
};

/** Get a reminder by id (creator-only or elevated roles) */
exports.getReminderById = async (req, res) => {
  try {
    const r = await MedicationReminder.findById(req.params.id)
      .populate('patient', 'fullname')
      .populate('entryReport', 'title');

    if (!r) return res.status(404).json({ message: 'Reminder not found' });

    const isOwner = String(r.createdBy) === String(req.user._id);
    const elevated = ['admin', 'caretaker'].includes(req.userRoleName || req.user.role);
    if (!isOwner && !elevated) {
      return res.status(403).json({ message: 'Forbidden: not the creator' });
    }

    res.json(r);
  } catch (err) {
    res.status(400).json({ message: 'Failed to get reminder', details: err.message });
  }
};

/** Update a reminder (creator-only or elevated roles) */
exports.updateReminder = async (req, res) => {
  try {
    const r = await MedicationReminder.findById(req.params.id);
    if (!r) return res.status(404).json({ message: 'Reminder not found' });

    const isOwner = String(r.createdBy) === String(req.user._id);
    const elevated = ['admin', 'caretaker'].includes(req.userRoleName || req.user.role);
    if (!isOwner && !elevated) {
      return res.status(403).json({ message: 'Forbidden: not the creator' });
    }

    const updatable = ['medicationName','dosage','instructions','startDate','endDate','schedule','notifyChannels','active'];
    for (const k of updatable) if (k in req.body) r[k] = req.body[k];

    // Recompute nextRunAt if schedule/startDate changed
    r.nextRunAt = computeNextRunAt(r);
    await r.save();

    res.json(r);
  } catch (err) {
    res.status(400).json({ message: 'Failed to update reminder', details: err.message });
  }
};

/** Delete (hard) a reminder (creator-only or elevated roles) */
exports.deleteReminder = async (req, res) => {
  try {
    const r = await MedicationReminder.findById(req.params.id);
    if (!r) return res.status(404).json({ message: 'Reminder not found' });

    const isOwner = String(r.createdBy) === String(req.user._id);
    const elevated = ['admin', 'caretaker'].includes(req.userRoleName || req.user.role);
    if (!isOwner && !elevated) {
      return res.status(403).json({ message: 'Forbidden: not the creator' });
    }

    await r.deleteOne();
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ message: 'Failed to delete reminder', details: err.message });
  }
};

/** Manual trigger ("Send Now") */
exports.triggerNow = async (req, res) => {
  try {
    const r = await MedicationReminder.findById(req.params.id);
    if (!r) return res.status(404).json({ message: 'Reminder not found' });

    const isOwner = String(r.createdBy) === String(req.user._id);
    const elevated = ['admin', 'caretaker'].includes(req.userRoleName || req.user.role);
    if (!isOwner && !elevated) {
      return res.status(403).json({ message: 'Forbidden: not the creator' });
    }

    await dispatcher.dispatch(r);
    r.lastTriggeredAt = new Date();
    // One-time reminder: disable after firing
    if (r.schedule && r.schedule.type === 'one_time') {
      r.nextRunAt = null;
      r.active = false;
    } else {
      r.nextRunAt = computeNextRunAt(r);
      if (!r.nextRunAt) r.active = false;
    }    
    await r.save();

    res.json({ ok: true, nextRunAt: r.nextRunAt });
  } catch (err) {
    res.status(400).json({ message: 'Failed to trigger reminder', details: err.message });
  }
};

/** Nurse/caretaker global filter: all my reminders by status */
exports.getReminders = async (req, res) => {
  try {
    const { status = 'all', limit = 50 } = req.query;
    const now = new Date();
    const query = {}; // If you want "only mine", add: { createdBy: req.user._id }

    if (status === 'pending') {
      query.active = true;
      query.nextRunAt = { $gt: now };
    } else if (status === 'sent') {
      query.lastTriggeredAt = { $ne: null };
    }

    const items = await MedicationReminder.find(query)
      .sort({ nextRunAt: 1, updatedAt: -1 })
      .limit(Math.min(Number(limit) || 50, 200))
      .populate('patient', 'fullname')
      .populate('entryReport', 'title')
      .populate('createdBy', 'fullname');

    res.json({ count: items.length, items });
  } catch (err) {
    res.status(400).json({ message: 'Failed to list reminders', details: err.message });
  }
};
