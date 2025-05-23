const mongoose = require('mongoose');

const PatientSchema = new mongoose.Schema({
  name: { type: String, required: true },
  age: { type: Number, required: true },
  generalPractitioner: { type: mongoose.Schema.Types.ObjectId, ref: 'GeneralPractitioner' },
  communityPharmacy: { type: mongoose.Schema.Types.ObjectId, ref: 'CommunityPharmacy' },
  medicalConditions: [{ type: String }], // List of health conditions
  role: { type: String, default: 'caretaker', immutable: true },
  assignedNurses: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Nurse' }],
  assignedCaretakers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Caretaker' }]
}, {
  timestamps: true, // Automatically handles createdAt and updatedAt
});

PatientSchema.pre('save', function (next) {
  this.updated_at = Date.now();
  next();
});

const Patient = mongoose.model('Patient', PatientSchema);

module.exports = Patient;
