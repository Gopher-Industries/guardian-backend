const mongoose = require('mongoose');
const User = require('./User');

const PatientSchema = new mongoose.Schema({
  fullname: { type: String, required: true },
  dateOfBirth: { type: Date, required: true },
  gender: { type: String, enum: ['male', 'female'], required: true },
  profilePhoto: { type: String },
  caretaker: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  assignedNurses: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  healthConditions: [{ type: String }],
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
});

// Helper: Check if given user IDs exist and have the expected role
async function assertUsersHaveRole(ids, roleName) {
  if (!ids || ids.length === 0) return;
  
  const users = await User.find({ _id: { $in: ids } }).populate('role', 'name');
  
  // Check if all users exist
  if (users.length !== ids.length) {
    const foundIds = users.map(u => u._id.toString());
    const missingIds = ids.filter(id => !foundIds.includes(id.toString()));
    throw new Error(`User references not found: ${missingIds.join(', ')}`);
  }
  
  // Check if all users have correct roles
  const invalid = users.filter(u => !u.role || u.role.name !== roleName);
  if (invalid.length) {
    throw new Error(`Users do not have required role '${roleName}': ${invalid.map(u => `${u.fullname} (${u._id})`).join(', ')}`);
  }
}

// Helper: Validate patient caregiver rules
async function validatePatientDoc(doc) {
  const hasCaretaker = !!doc.caretaker;
  const hasNurses = Array.isArray(doc.assignedNurses) && doc.assignedNurses.length > 0;

  // Ensure patient has at least one caregiver
  if (!hasCaretaker && !hasNurses) {
    throw new Error('Patient must have at least one caretaker or nurse assigned');
  }

  // Validate caretaker exists and has correct role
  if (hasCaretaker) {
    await assertUsersHaveRole([doc.caretaker], 'caretaker');
  }
  
  // Validate nurses exist and have correct roles
  if (hasNurses) {
    await assertUsersHaveRole(doc.assignedNurses, 'nurse');
  }
  
  // Validate date of birth is not in the future
  if (doc.dateOfBirth && doc.dateOfBirth > new Date()) {
    throw new Error('Date of birth cannot be in the future');
  }
  
  // Validate patient is not too young (must be at least 18 years old)
  if (doc.dateOfBirth) {
    const age = Math.floor((new Date() - new Date(doc.dateOfBirth)) / (365.25 * 24 * 60 * 60 * 1000));
    if (age < 18) {
      throw new Error('Patient must be at least 18 years old');
    }
  }
}

// Pre-save validation
PatientSchema.pre('save', async function (next) {
  try {
    await validatePatientDoc(this);
    this.updated_at = Date.now();
    next();
  } catch (err) {
    next(err);
  }
});

// Pre-update validation
PatientSchema.pre('findOneAndUpdate', async function (next) {
  try {
    const update = this.getUpdate() || {};
    const $set = update.$set || update;
    const current = await this.model.findOne(this.getQuery()).lean();

    if (!current) {
      throw new Error('Patient not found for update');
    }

    const merged = {
      fullname: $set.fullname !== undefined ? $set.fullname : current.fullname,
      dateOfBirth: $set.dateOfBirth !== undefined ? $set.dateOfBirth : current.dateOfBirth,
      gender: $set.gender !== undefined ? $set.gender : current.gender,
      caretaker: $set.caretaker !== undefined ? $set.caretaker : current.caretaker,
      assignedNurses: $set.assignedNurses !== undefined ? $set.assignedNurses : current.assignedNurses || []
    };

    await validatePatientDoc(merged);

    if (!update.$set) update.$set = {};
    update.$set.updated_at = Date.now();
    this.setUpdate(update);

    next();
  } catch (err) {
    next(err);
  }
});

// Prevent deletion of patients who have entry reports
PatientSchema.pre('deleteOne', { document: true, query: false }, async function (next) {
  try {
    const EntryReport = mongoose.model('EntryReport');
    const reportCount = await EntryReport.countDocuments({ patient: this._id });
    
    if (reportCount > 0) {
      throw new Error(`Cannot delete patient: ${reportCount} entry reports depend on this patient. Delete reports first or use soft delete.`);
    }
    
    next();
  } catch (error) {
    next(error);
  }
});

// Prevent deletion via findOneAndDelete
PatientSchema.pre('findOneAndDelete', async function (next) {
  try {
    const patient = await this.model.findOne(this.getQuery());
    if (!patient) return next();
    
    const EntryReport = mongoose.model('EntryReport');
    const reportCount = await EntryReport.countDocuments({ patient: patient._id });
    
    if (reportCount > 0) {
      throw new Error(`Cannot delete patient: ${reportCount} entry reports depend on this patient. Delete reports first or use soft delete.`);
    }
    
    next();
  } catch (error) {
    next(error);
  }
});

module.exports = mongoose.model('Patient', PatientSchema);
