const mongoose = require('mongoose');
const ReviewerSignatureSchema = require('./embedded/ReviewerSignature');
const RevisionSchema = require('./embedded/RevisionSchema');
const Number = require('./embedded/NumericSchema');
const Text = require('./embedded/TextSchema');

const ObservationSchema = new mongoose.Schema({
  temperature: { type: Number },
  bloodPressure: {
    systolic: { type: Number },
    diastolic: { type: Number }
  },
  heartRate: { type: Number },
  oxygenSaturation: { type: Number },
  mobility: { type: Text },  
  respiratoryRate: { type: Number },
  painScore: { type: Number },
  glascowComaScale: { type: Number},
  dysphagia: { type: Text },
  iddsi: { type: Number },
  isComplete: { type: Boolean, default: false }, // Not all fields are filled, prompt for is it complete?  
  timestamp: { type: Date, default: Date.now },
}, { _id: false });

const NurseObservationSchema = new mongoose.Schema({
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  nurse: { type: mongoose.Schema.Types.ObjectId, ref: 'Nurse', required: true },
  observations: [ObservationSchema],
  notes: { type: String, required: true },
  signedBy: { type: ReviewerSignatureSchema, required: true, immutable: true },
  revisionHistory: [RevisionSchema]
}, { timestamps: true });

module.exports = mongoose.model('NurseObservation', NurseObservationSchema);

const mongoose = require('mongoose');
