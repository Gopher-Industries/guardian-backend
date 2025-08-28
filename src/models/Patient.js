const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const User = require('./User');

const { Schema, Types: { ObjectId } } = mongoose;

const PatientSchema = new Schema({
  uuid: { type: String, default: uuidv4, unique: true, index: true },

  fullname:    { type: String, required: true, trim: true },
  dateOfBirth: { type: Date,   required: true },
  gender:      { type: String, enum: ['M', 'F', 'other', 'male', 'female'], required: true },

  // Organization tenant (null => freelance)
  organization: { type: ObjectId, ref: 'Organization', default: null },

  // Assignments (single)
  assignedNurse:     { type: ObjectId, ref: 'User', default: null },
  assignedCaretaker: { type: ObjectId, ref: 'User', default: null },

  // Optional
  profilePhoto:   { type: String, default: null },
  dateOfAdmitting:{ type: Date, default: null },
  description:    { type: String, default: null },

  // Audit
  createdBy: { type: ObjectId, ref: 'User', required: true },

  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
});

PatientSchema.index({ organization: 1 });
PatientSchema.index({ assignedNurse: 1 });
PatientSchema.index({ assignedCaretaker: 1 });
PatientSchema.index({ fullname: 'text' });
PatientSchema.index({ organization: 1, created_at: -1 });

// Back-compat: expose organizationName virtually
PatientSchema.virtual('organizationName').get(function () {
  return this.populated('organization') && this.organization
    ? this.organization.name
    : null;
});

PatientSchema.set('toObject', { virtuals: true });
PatientSchema.set('toJSON', { virtuals: true });

PatientSchema.pre('save', async function (next) {
  try {
    this.updated_at = Date.now();

    const checks = [];
    if (this.assignedNurse)     checks.push({ id: this.assignedNurse,     expected: 'nurse' });
    if (this.assignedCaretaker) checks.push({ id: this.assignedCaretaker, expected: 'caretaker' });

    if (checks.length) {
      const users = await User.find({ _id: { $in: checks.map(c => c.id) } }).populate('role');
      for (const c of checks) {
        const u = users.find(x => String(x._id) === String(c.id));
        const roleName = u?.role?.name?.toLowerCase();
        if (!roleName || roleName !== c.expected) {
          return next(new Error(`Assigned ${c.expected} must be a user with role "${c.expected}".`));
        }
      }
    }

    next();
  } catch (err) {
    next(err);
  }
});

module.exports = mongoose.model('Patient', PatientSchema);
