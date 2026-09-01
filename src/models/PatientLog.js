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
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },
  observations: { type: String, required: true },
  actionsRequired: { type: mongoose.Schema.Types.Mixed, default: [] },
  recordedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('PatientLog', PatientLogSchema);
