// src/models/MedicationReminder.js
const mongoose = require('mongoose');

// Sub-schema for scheduling details
const scheduleSchema = new mongoose.Schema({
  type: { type: String, enum: ['one_time', 'recurring'], required: true }, // Reminder type
  at: Date,                // One-time reminder datetime
  timesOfDay: [String],    // Array of times e.g. ["08:00", "20:00"]
  daysOfWeek: [Number],    // 0=Sunday, 6=Saturday
  timezone: { type: String, default: 'Australia/Melbourne' } // Timezone for scheduling
}, { _id: false });

// Main schema for medication reminder
const reminderSchema = new mongoose.Schema({
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  medicationName: { type: String, required: true }, // Name of medication
  dosage: String,                                   // Dosage information
  instructions: String,                             // Instructions for intake
  startDate: { type: Date, required: true },        // Start of the schedule
  endDate: Date,                                    // Optional end date
  schedule: { type: scheduleSchema, required: true },
  notifyChannels: [{ type: String, enum: ['in_app','sms','email','push'], default: 'in_app' }],
  lastTriggeredAt: Date,    // Last time the reminder was triggered
  nextRunAt: Date,          // Next scheduled trigger time
  active: { type: Boolean, default: true }
}, { timestamps: true });

// Index for efficient scheduler queries
reminderSchema.index({ active: 1, nextRunAt: 1 });

module.exports = mongoose.model('MedicationReminder', reminderSchema);
