const mongoose = require('mongoose');

const DoctorSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  specialization: { type: String, default: null },
  licenseNumber: { type: String, default: null },
}, {
  timestamps: true
});

module.exports = mongoose.model('Doctor', DoctorSchema);
