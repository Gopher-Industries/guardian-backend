const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const Email = require('./embedded/EmailSchema');
const Text = require('./embedded/TextSchema');
const RevisionSchema = require('./embedded/RevisionSchema');

const NurseSchema = new mongoose.Schema({
  name: { type: Text, required: true },
  email: { type: Email, required: true, unique: true },
  password: { type: String, required: true, select: false },
  ahpra: { type: Number, required: true }, // AHPRA registration number
  isApproved: { type: Boolean, default: false },
  assignedPatients: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Patient' }], // Assigned patients
  role: { type: String, default: 'nurse', immutable: true },  // Make role immutable means it can not be changed
  lastPasswordChange: { type: Date, default: Date.now },
  failedLoginAttempts: { type: Number, default: 0 },
  signedBy: { id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, name: String, signedAt: Date },
  revisionHistory: [RevisionSchema]
}, {
  timestamps: true, // Automatically handles createdAt and updatedAt
});

NurseSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.lastPasswordChange = Date.now();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Define a method to check if the entered password matches the stored one
NurseSchema.methods.comparePassword = async function (enteredPassword) {
  return bcrypt.compare(enteredPassword, this.password);
};

const Nurse = mongoose.model('Nurse', NurseSchema);

module.exports = Nurse;
