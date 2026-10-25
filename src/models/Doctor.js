const mongoose = require('mongoose');

const DoctorSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  specialization: { type: String, default: null },
  // TODO: add proper format validation and official registry verification for licenseNumber
  licenseNumber: { type: String, default: null },
}, {
  timestamps: true
});

module.exports = mongoose.model('Doctor', DoctorSchema);
