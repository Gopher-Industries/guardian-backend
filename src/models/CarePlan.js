const mongoose = require('mongoose');
const Text = require('./embedded/TextSchema');
const RevisionSchema = require('./embedded/RevisionSchema');
const ReviewerSignatureSchema = require('./embedded/ReviewerSignature');

const CarePlanSchema = new mongoose.Schema({
  planTitle: { type: Text, required: true },
  objectives: [{ type: Text }],
  interventions: [{ type: Text }],
  goals: [{ type: Text }],
  notes: { type: Text },
  tasks: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Task' }],
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  caretaker: { type: mongoose.Schema.Types.ObjectId, ref: 'Caretaker' },
  nurse: { type: mongoose.Schema.Types.ObjectId, ref: 'Nurse' },
  pharmacist: { type: mongoose.Schema.Types.ObjectId, ref: 'Pharmacist' },
  isComplete: { type: Boolean, default: false },
  signedBy: { type: ReviewerSignatureSchema, required: true, immutable: true },
  revisionHistory: [RevisionSchema]
}, { timestamps: true });

module.exports = mongoose.model('CarePlan', CarePlanSchema);