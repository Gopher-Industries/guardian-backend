// models/PatientLog.js
const mongoose = require('mongoose');

const PatientLogSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // nurse or caretaker
  createdAt: { type: Date, default: Date.now }
});

PatientLogSchema.index({ patient: 1, createdAt: -1 });
PatientLogSchema.index({ createdBy: 1, createdAt: -1 });

module.exports = mongoose.model('PatientLog', PatientLogSchema);
