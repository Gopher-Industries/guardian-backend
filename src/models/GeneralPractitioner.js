const mongoose = require('mongoose');
const Phone = require('./embedded/PhoneSchema');
const Email = require('./embedded/EmailSchema');
const Address = require('./embedded/AddressSchema');
const Text = require('./embedded/TextSchema');
const RevisionSchema = require('./embedded/RevisionSchema');
const ReviewerSignatureSchema = require('./embedded/ReviewerSignature');

const generalPractitionerSchema = new mongoose.Schema({
  doctorName: { type: Text, required: true, trim: true },
  clinicName: { type: Text, required: true, trim: true },
  phone: { type: Phone, trim: true },
  email: { type: Email, trim: true, lowercase: true },
  address: { type: Address, trim: true },
  faxNumber: { type: Phone, trim: true },
  isComplete: { type: Boolean, default: false },
  signedBy: { type: ReviewerSignatureSchema, required: true, immutable: true },
  revisionHistory: [RevisionSchema],
  notes: { type: Text, trim: true }
}, {
  timestamps: true // Adds createdAt and updatedAt
});

module.exports = mongoose.model('GeneralPractitioner', generalPractitionerSchema);
