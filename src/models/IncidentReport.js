const mongoose = require('mongoose');
const ReviewerSignatureSchema = require('./embedded/ReviewerSignature');

const IncidentReportSchema = new mongoose.Schema({
  reportedBy: {
    id: { type: mongoose.Schema.Types.ObjectId, required: true },
    name: { type: String, required: true },
    role: { type: String, enum: ['nurse', 'pharmacist'], required: true }
  },
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  incidentType: { type: String, required: true },
  description: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  followUpActions: { type: String },
  resolved: { type: Boolean, default: false },
  signedBy: { type: ReviewerSignatureSchema, immutable: true }
}, { timestamps: true });

module.exports = mongoose.model('IncidentReport', IncidentReportSchema);