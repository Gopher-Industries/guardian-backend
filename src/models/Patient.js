const mongoose = require('mongoose');
const User = require('./User');

const PatientSchema = new mongoose.Schema({
  fullname: { type: String, required: true },
  dateOfBirth: { type: Date, required: true },
  gender: { type: String, enum: ['male', 'female'], required: true },

  profilePhoto: { type: String }, // Filename or full URL depending on storage strategy

  caretaker: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // Single caretaker assigned

  assignedNurses: [
    { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  ],

  healthConditions: [{ type: String }], // Optional: List of chronic conditions, allergies, etc.

  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
});

PatientSchema.pre('save', async function (next) {
  try {
    // Validate each assigned nurse has the role 'nurse'
    if (this.assignedNurses && this.assignedNurses.length > 0) {
      const nurses = await User.find({ _id: { $in: this.assignedNurses } }).populate('role');

      const invalidUsers = nurses.filter(u => !u.role || u.role.name !== 'nurse');
      if (invalidUsers.length > 0) {
        return next(new Error('All assigned nurses must have the role "nurse".'));
      }
    }

    this.updated_at = Date.now();
    next();
  } catch (err) {
    next(err);
  }
});

const Patient = mongoose.model('Patient', PatientSchema);

module.exports = Patient;
