// models/PatientLog.js
const mongoose = require('mongoose');

const PatientLogSchema = new mongoose.Schema({
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  location: {
    type: String,
    enum: ['home', 'hospital', 'clinic', 'care_facility', 'telehealth', 'other'],
    default: 'other'
  },
  address: { type: String, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedAt: { type: Date },
  title: { type: String, required: true },
  observations: { type: String, required: true },
  actionsRequired: { type: mongoose.Schema.Types.Mixed, default: [] },
  recordedAt: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now }
});

PatientLogSchema.index({ patient: 1, createdAt: -1 });
PatientLogSchema.index({ createdBy: 1, createdAt: -1 });

module.exports = mongoose.model('PatientLog', PatientLogSchema);
