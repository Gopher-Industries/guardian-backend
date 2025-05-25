const mongoose = require('mongoose');
const ReviewerSignatureSchema = require('./embedded/ReviewerSignature');
const RevisionSchema = require('./embedded/RevisionSchema');
const Number = require('./embedded/NumericSchema');
const Text = require('./embedded/TextSchema');

const MedicationEntrySchema = new mongoose.Schema({
  name: { type: Text },
  dosage: {
    amount: { type: Number },
    units: { type: Text},
  },
  frequency: { type: Text },
  route: { type: Text },
  indication: { type: Text },
  startDate: { type: Date },
  endDate: { type: Date },
  isComplete: { type: Boolean, default: false }, // Is incomplete if any field other than start/end date is blank
  signedBy: { type: ReviewerSignatureSchema, required: true, immutable: true },
  revisionHistory: [RevisionSchema],
  notes: { type: Text }
}, { _id: false });

const MedicationRecordSchema = new mongoose.Schema({
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  allergies: [{ type: Text }],
  records: [MedicationEntrySchema],
  isComplete: { type: Boolean, default: false }, // is incomplete if Allergies is not completed.
  recordSignedBy: { type: ReviewerSignatureSchema, required: true, immutable: true },
  notes: { type: Text }
}, { timestamps: true });

module.exports = mongoose.model('MedicationRecord', MedicationRecordSchema);