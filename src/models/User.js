const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
  fullname: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password_hash: { type: String, required: true },
  role: { type: mongoose.Schema.Types.ObjectId, ref: 'Role', required: true },
  assignedPatients: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Patient' }],
  lastPasswordChange: { type: Date, default: Date.now },
  failedLoginAttempts: { type: Number, default: 0 },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
});

// Validation: Ensure role exists and is valid
UserSchema.pre('save', async function (next) {
  try {
    this.updated_at = Date.now();
    
    // Validate role exists
    if (this.role) {
      const Role = mongoose.model('Role');
      const roleExists = await Role.findById(this.role);
      if (!roleExists) {
        throw new Error(`Invalid role reference: ${this.role}`);
      }
    }
    
    // Hash password if modified
    if (this.isModified('password_hash')) {
      this.lastPasswordChange = Date.now();
      const salt = await bcrypt.genSalt(10);
      this.password_hash = await bcrypt.hash(this.password_hash, salt);
    }
    
    next();
  } catch (error) {
    next(error);
  }
});

// Validation for updates
UserSchema.pre('findOneAndUpdate', async function (next) {
  try {
    const update = this.getUpdate() || {};
    const $set = update.$set || update;
    
    if ($set.role) {
      const Role = mongoose.model('Role');
      const roleExists = await Role.findById($set.role);
      if (!roleExists) {
        throw new Error(`Invalid role reference: ${$set.role}`);
      }
    }
    
    if (!update.$set) update.$set = {};
    update.$set.updated_at = Date.now();
    this.setUpdate(update);
    
    next();
  } catch (error) {
    next(error);
  }
});

// Prevent deletion of users who are assigned to patients
UserSchema.pre('deleteOne', { document: true, query: false }, async function (next) {
  try {
    const Patient = mongoose.model('Patient');
    
    // Check if user is assigned as caretaker
    const patientsAsCaretaker = await Patient.countDocuments({ caretaker: this._id });
    if (patientsAsCaretaker > 0) {
      throw new Error(`Cannot delete user: ${patientsAsCaretaker} patients depend on this user as caretaker`);
    }
    
    // Check if user is assigned as nurse
    const patientsAsNurse = await Patient.countDocuments({ assignedNurses: this._id });
    if (patientsAsNurse > 0) {
      throw new Error(`Cannot delete user: ${patientsAsNurse} patients depend on this user as nurse`);
    }
    
    next();
  } catch (error) {
    next(error);
  }
});

// Prevent deletion via findOneAndDelete
UserSchema.pre('findOneAndDelete', async function (next) {
  try {
    const user = await this.model.findOne(this.getQuery());
    if (!user) return next();
    
    const Patient = mongoose.model('Patient');
    
    const patientsAsCaretaker = await Patient.countDocuments({ caretaker: user._id });
    if (patientsAsCaretaker > 0) {
      throw new Error(`Cannot delete user: ${patientsAsCaretaker} patients depend on this user as caretaker`);
    }
    
    const patientsAsNurse = await Patient.countDocuments({ assignedNurses: user._id });
    if (patientsAsNurse > 0) {
      throw new Error(`Cannot delete user: ${patientsAsNurse} patients depend on this user as nurse`);
    }
    
    next();
  } catch (error) {
    next(error);
  }
});

const User = mongoose.model('User', UserSchema);

module.exports = User;