const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const { Schema, Types: { ObjectId } } = mongoose;

const UserSchema = new Schema({
  uuid: { type: String, default: () => require('uuid').v4(), unique: true, index: true },

  fullname: { type: String, required: true, trim: true },
  email:    { type: String, required: true, unique: true, index: true },
  password_hash: { type: String, required: true },

  role: { type: ObjectId, ref: 'Role', required: false },

  // org membership (null = freelance)
  organization: { type: ObjectId, ref: 'Organization', default: null },

  // approvals (for nurse/caretaker)
  isApproved: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },

  age: { type: Number, default: null },
  qualifications: { type: String, default: '' },

  assignedPatients: [{ type: ObjectId, ref: 'Patient' }],

  lastPasswordChange: { type: Date, default: Date.now },
  failedLoginAttempts:{ type: Number, default: 0 },
  created_at:         { type: Date, default: Date.now },
  updated_at:         { type: Date, default: Date.now }

  
});

UserSchema.index({ organization: 1 });

UserSchema.methods.comparePassword = async function (plain) {
  return bcrypt.compare(plain, this.password_hash);
};

UserSchema.pre('save', async function (next) {
  this.updated_at = Date.now();
  if (!this.isModified('password_hash')) return next();
  this.lastPasswordChange = Date.now();
  const salt = await bcrypt.genSalt(10);
  this.password_hash = await bcrypt.hash(this.password_hash, salt);
  next();
});

module.exports = mongoose.model('User', UserSchema);
