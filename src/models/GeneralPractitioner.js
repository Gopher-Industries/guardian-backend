const mongoose = require('mongoose');

const generalPractitionerSchema = new mongoose.Schema({
  doctorName: { type: String, required: true, trim: true },
  clinicName: { type: String, required: true, trim: true },
  contactNumber: { type: String, trim: true },
  email: { type: String, trim: true, lowercase: true },
  address: { type: String, trim: true },
  faxNumber: { type: String, trim: true },
  notes: { type: String, trim: true }
}, {
  timestamps: true // Adds createdAt and updatedAt
});

module.exports = mongoose.model('GeneralPractitioner', generalPractitionerSchema);
