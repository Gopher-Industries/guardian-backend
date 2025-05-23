const mongoose = require('mongoose');
const NurseSignatureSchema = require('./embedded/NurseSignature');

const ObservationSchema = new mongoose.Schema({
  temperature: { type: Number },
  bloodPressure: {
    systolic: { type: Number, required: true },
    diastolic: { type: Number, required: true }
  },
  heartRate: { type: Number, required: true },
  oxygenSaturation: { type: Number },
  mobility: { type: String },  
  respiratoryRate: { type: Number, required: true },
  painScore: { type: Number },
  glascowComaScale: { type: Number },
  dysphagia: { type: String },
  iddsi: { type: Number },  
  timestamp: { type: Date, default: Date.now }
}, { _id: false });

const NurseObservationSchema = new mongoose.Schema({
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  nurse: { type: mongoose.Schema.Types.ObjectId, ref: 'Nurse', required: true },
  observations: [ObservationSchema],
  notes: { type: String, required: true },
  signedBy: NurseSignatureSchema
}, { timestamps: true });

module.exports = mongoose.model('NurseObservation', NurseObservationSchema);

const mongoose = require('mongoose');
