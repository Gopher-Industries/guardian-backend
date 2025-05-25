const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const RevisionSchema = require('./embedded/RevisionSchema');
const ReviewerSignatureSchema = require('./embedded/ReviewerSignature');

const PatientSelfRegistrationSchema = new mongoose.Schema({
  name: {type: String, required: true },
  age: { type: Number, required: true },
  contact: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  signedBy: { type: ReviewerSignatureSchema, required: true, immutable: true },
  revisionHistory: [RevisionSchema]
}, {
  timestamps: true, // Automatically handles createdAt and updatedAt
});

// Encrypt password before saving
PatientSelfRegistrationSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

module.exports = mongoose.model('PatientSelfRegistration', PatientSelfRegistrationSchema);
