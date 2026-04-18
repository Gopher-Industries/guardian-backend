const mongoose = require('mongoose');

const HealthRecordSchema = new mongoose.Schema({
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  nurse: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  caretaker: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  vitals: {
    temperature: { type: Number, required: true },
    bloodPressure: { type: String, required: true },
    heartRate: { type: Number, required: true },
    respiratoryRate: { type: Number, required: true }
  },
  notes: { type: String }, // Notes from the nurse or caretaker
  created_at: { type: Date, default: Date.now }
});

HealthRecordSchema.index({ patient: 1, created_at: -1 });

const HealthRecord = mongoose.model('HealthRecord', HealthRecordSchema);

module.exports = HealthRecord;
