// models/DeliveryAttempt.js
const mongoose = require('mongoose');

const DeliveryAttemptSchema = new mongoose.Schema(
  {
    reminderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Reminder', required: true, index: true },
    dueAt: { type: Date, required: true },
    sentAt: { type: Date },
    provider: { type: String, default: 'notifications-api' },
    result: { type: String, enum: ['SENT', 'FAILED', 'TIMEOUT'], required: true },
    error: { type: String }
  },
  { timestamps: true }
);

module.exports = mongoose.model('DeliveryAttempt', DeliveryAttemptSchema);
