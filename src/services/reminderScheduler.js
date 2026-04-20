// src/services/reminderScheduler.js
// Cron job that checks due reminders every minute and dispatches them.

const cron = require('node-cron');
const MedicationReminder = require('../models/MedicationReminder');
const dispatcher = require('./reminderDispatcher');
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


async function tick() {
  const now = new Date();
  const due = await MedicationReminder.find({
    active: true,
    nextRunAt: { $ne: null, $lte: now }
  }).limit(200);

  for (const r of due) {
    try {
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
    } catch (err) {
      console.error('[scheduler] dispatch error:', r._id, err.message);
    }
  }
}

let job = null;
exports.start = () => {
  if (job) return;
  console.log('[reminderScheduler] started');
  job = cron.schedule('* * * * *', tick, { timezone: 'UTC' }); // run every minute
};
exports.stop = () => {
  if (job) job.stop();
  job = null;
};
