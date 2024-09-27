const mongoose = require('mongoose');

const PatientSchema = new mongoose.Schema({
  name: { type: String, required: true },
  age: { type: Number, required: true },
  healthConditions: [{ type: String }], // List of health conditions
  assignedNurses: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Nurse' }],
  assignedCaretakers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Caretaker' }],
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
});

PatientSchema.pre('save', function (next) {
  this.updated_at = Date.now();
  next();
});

const Patient = mongoose.model('Patient', PatientSchema);

module.exports = Patient;
