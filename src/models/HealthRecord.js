const mongoose = require('mongoose');

const HealthRecordSchema = new mongoose.Schema({
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  nurse: { type: mongoose.Schema.Types.ObjectId, ref: 'Nurse', required: true },
  pharmaciest: { type: mongoose.Schema.Types.ObjectId, ref: 'Pharmacist', required: true },
  caretaker: { type: mongoose.Schema.Types.ObjectId, ref: 'Caretaker', required: true },
  vitals: {    
    temperature: { type: Number, required: true },
    bloodPressure: { type: String, required: true },
    heartRate: { type: Number, required: true },
    mobility: { type: String, required: true}, //Can the resident move independantly or do they require assistance?
    respiratoryRate: { type: Number, required: true },    
    glascowComaScale: { type: Number, required: true}, // GCS is a measure of alterness.
    dysphagia : { type: String, required: true }, // Swallowing difficulties requiring food modification, or normal swallow function?
    iddsi: { type: Number, required: true } // The International Dysphagia Diet Standardisation Initiative - Indicates the level of food and fluid modification required for a patient
  },
  notes: { type: String }, // Notes from the nurse, pharmacist or caretaker
  created_at: { type: Date, default: Date.now }
});

const HealthRecord = mongoose.model('HealthRecord', HealthRecordSchema);

module.exports = HealthRecord;
