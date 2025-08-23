// models/Reminder.js
const mongoose = require('mongoose');

const ReminderSchema = new mongoose.Schema(
  {
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    medicationId: { type: String, required: true }, 
    dosage: { type: String, required: true },
    note: { type: String },
    channels: [{ type: String, enum: ['sms', 'push', 'email'], required: true }],
    timezone: { type: String, required: true }, // e.g. Australia/Melbourne
    schedule: {
      type: {
        type: String,
        enum: ['ONE_OFF', 'RRULE'],
        required: true
      },
      startAt: { type: Date, required: true },       
      rrule: { type: String }                   
    },
    nextFireAt: { type: Date, index: true },       
    status: { type: String, enum: ['PENDING', 'ACTIVE', 'PAUSED', 'CANCELLED'], default: 'ACTIVE', index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
  },
  { timestamps: true }
);

ReminderSchema.index({ patientId: 1, nextFireAt: 1 });

module.exports = mongoose.model('Reminder', ReminderSchema);
