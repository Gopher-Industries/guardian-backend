const mongoose = require('mongoose');

const DoctorSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  phone: { type: String, default: null },
  gender: { type: String, default: null },
  age: { type: Number, default: null },
  address: { type: String, default: null },
}, {
  timestamps: true
});

module.exports = mongoose.model('Doctor', DoctorSchema);
