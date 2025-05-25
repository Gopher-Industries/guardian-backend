const mongoose = require('mongoose');
const Text = require('./embedded/TextSchema');
const ReviewerSignatureSchema = require('./embedded/ReviewerSignature');
const RevisionSchema = require('./embedded/RevisionSchema');

const IncidentReportSchema = new mongoose.Schema({
  reportedBy: {
    id: { type: mongoose.Schema.Types.ObjectId, required: true },
    name: { type: Text, required: true },
    role: { type: String, enum: ['nurse', 'pharmacist'], required: true }
  },
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  incidentType: { type: Text, required: true },
  description: { type: Text },
  timestamp: { type: Date, default: Date.now },
  followUpActions: { type: Text },
  resolved: { type: Boolean, default: false },
  resolvedAt: { type: Date },
  isComplete: { type: Boolean, default: false },
  signedBy: { type: ReviewerSignatureSchema, required: true, immutable: true },
  revisionHistory: [RevisionSchema],  
}, { timestamps: true });

module.exports = mongoose.model('IncidentReport', IncidentReportSchema);