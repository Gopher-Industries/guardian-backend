const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password_hash: { type: String, required: true, select: false },
  role: { type: mongoose.Schema.Types.ObjectId, ref: 'Role' },
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: false }, // links Users with Patient data, but allows non-patient users
  lastPasswordChange: { type: Date, default: Date.now },
  failedLoginAttempts: { type: Number, default: 0 }
}, {
  timestamps: true, // Automatically handles createdAt and updatedAt
});

UserSchema.pre('save', async function (next) {
  this.updated_at = Date.now();
  if (!this.isModified('password_hash')) return next();
  this.lastPasswordChange = Date.now();
  const salt = await bcrypt.genSalt(10);
  this.password_hash = await bcrypt.hash(this.password_hash, salt);
  next();
});

//remove sensitive data from JSON responses
UserSchema.methods.toJSON = function () {
  const userObj = this.toObject();
  delete userObj.password_hash;
  delete userObj.__v;
  return userObj;
};

// Create the User model from the schema
const User = mongoose.model('User', UserSchema);

module.exports = User;