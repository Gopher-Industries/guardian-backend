const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const AdminSchema = new mongoose.Schema({
  name:   { type: String, required: true, trim: true },
  email:  { type: String, required: true, unique: true, index: true },
  password: { type: String, required: true },           // hashed in pre-save
  role:   { type: String, default: 'admin', immutable: true },

  // ⬇ NEW: tie this admin to an organization (dashboard scope)
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },

  lastPasswordChange:   { type: Date, default: Date.now },
  failedLoginAttempts:  { type: Number, default: 0 },
  created_at:           { type: Date, default: Date.now },
  updated_at:           { type: Date, default: Date.now }
});

// Hash before save
AdminSchema.pre('save', async function (next) {
  this.updated_at = Date.now();
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  this.lastPasswordChange = Date.now();
  next();
});

// Optional helper
AdminSchema.methods.comparePassword = function (plain) {
  return bcrypt.compare(plain, this.password);
};

module.exports = mongoose.model('Admin', AdminSchema);
