// src/models/MedicationReminder.js
// Medication reminder model that ALWAYS stores: patientLog (EntryReport), patient, and createdBy (User).

const mongoose = require('mongoose');

const scheduleSchema = new mongoose.Schema(
  {
    // 'one_time' executes once at 'at' (ISO date)
    // 'recurring' executes on specified days/times using 'timezone'
    type: { type: String, enum: ['one_time', 'recurring'], required: true },
    at: { type: Date },                  // required for one_time
    timesOfDay: [{ type: String }],      // e.g. ["08:00","20:00"] (24h)
    daysOfWeek: [{ type: Number }],      // 0..6 (Sun..Sat). If omitted -> every day
    timezone: { type: String, default: 'Australia/Melbourne' }
  },
  { _id: false }
);

const reminderSchema = new mongoose.Schema(
  {
    // REQUIRED linkage as you requested:
    entryReport: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PatientLog',
      required: true,
      index: true
    },
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Patient',
      required: true,
      index: true
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },

    medicationName: { type: String, required: true },
    dosage: { type: String },
    instructions: { type: String },
    startDate: { type: Date, required: true },
    endDate: { type: Date },

    schedule: { type: scheduleSchema, required: true },
    notifyChannels: [{
      type: String,
      enum: ['in_app', 'email', 'sms', 'push'],
      default: 'in_app'
    }],

    lastTriggeredAt: { type: Date, default: null },
    nextRunAt: { type: Date, default: null },
    active: { type: Boolean, default: true }
  },
  { timestamps: true }
);

// Efficient scans for scheduler and nurse filters
reminderSchema.index({ active: 1, nextRunAt: 1 });
reminderSchema.index({ createdBy: 1 });

// Data consistency: ensure patient matches the patient in the bound log
reminderSchema.pre('validate', async function () {
  const Reminder = this;
  const PatientLog = require('./PatientLog'); // lazy require to avoid cycles
  const log = await PatientLog.findById(Reminder.entryReport).select('patient');
  if (!log) throw new Error('Patient log (entryReport) not found');
  if (String(log.patient) !== String(Reminder.patient)) {
    throw new Error('patient does not match the patient in the bound patient log');
  }
});

module.exports = mongoose.model('MedicationReminder', reminderSchema);
