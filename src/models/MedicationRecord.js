const mongoose = require('mongoose');
const ReviewerSignatureSchema = require('./embedded/ReviewerSignature').schema;

const MedicationEntrySchema = new mongoose.Schema({
  medicationName: { type: String, required: true },
  dosage: { type: String, required: true },
  frequency: { type: String, required: true },
  route: { type: String, required: true },
  indication: { type: String, required: true },
  startDate: { type: Date },
  endDate: { type: Date },
  notes: { type: String }
}, { _id: false });

const RevisionSchema = new mongoose.Schema({
  updatedBy: {
    id: { type: mongoose.Schema.Types.ObjectId },
    name: String,
    role: { type: String, enum: ['nurse', 'pharmacist'] }
  },
  updatedAt: Date,
  changes: String
}, { _id: false });

const MedicationRecordSchema = new mongoose.Schema({
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  allergies: [{ type: String, required: true }],
  records: [MedicationEntrySchema],
  reviewerSignature: {
    type: ReviewerSignatureSchema,
    required: true, immutable: true
  },
  revisionHistory: [RevisionSchema]
}, { timestamps: true });

module.exports = mongoose.model('MedicationRecord', MedicationRecordSchema);