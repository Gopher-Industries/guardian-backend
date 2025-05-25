const mongoose = require('mongoose');
const RevisionSchema = require('./embedded/RevisionSchema');
const ReviewerSignatureSchema = require('./embedded/ReviewerSignature');

const PatientSchema = new mongoose.Schema({
  name: { type: String, required: true },
  age: { type: Number, required: true },
  generalPractitioner: { type: mongoose.Schema.Types.ObjectId, ref: 'GeneralPractitioner' },
  communityPharmacy: { type: mongoose.Schema.Types.ObjectId, ref: 'CommunityPharmacy' },
  medicalConditions: [{ type: String }], // List of health conditions
  role: { type: String, default: 'patient', immutable: true },
  assignedNurses: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Nurse' }],
  assignedCaretakers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Caretaker' }],
  isComplete: { type: Boolean, default: false }, // is incomplete if any field is blank
  signedBy: { type: ReviewerSignatureSchema, required: true, immutable: true },
  revisionHistory: [RevisionSchema]
}, {
  timestamps: true, // Automatically handles createdAt and updatedAt
});

PatientSchema.pre('save', function (next) {
  this.updated_at = Date.now();
  next();
});

const Patient = mongoose.model('Patient', PatientSchema);

module.exports = Patient;
