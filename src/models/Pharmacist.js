const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const PharmacistSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true, select: false },
  ahpra: { type: Number, required: true }, // AHPRA registration number
  isApproved: { type: Boolean, default: false },
  assignedPatients: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Patient' }], // Assigned patients
  role: { type: String, default: 'pharmacist', immutable: true },  // Make role immutable means it can not be changed
  lastPasswordChange: { type: Date, default: Date.now },
  failedLoginAttempts: { type: Number, default: 0 }
}, {
  timestamps: true, // Automatically handles createdAt and updatedAt
});

PharmacistSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.lastPasswordChange = Date.now();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Define a method to check if the entered password matches the stored one
PharmacistSchema.methods.comparePassword = async function (enteredPassword) {
  return bcrypt.compare(enteredPassword, this.password);
};

const Pharmacist = mongoose.model('Pharmacist', PharmacistSchema);

module.exports = Pharmacist;
