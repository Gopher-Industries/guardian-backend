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

// Helper: Check if given user IDs have the expected role
async function assertUsersHaveRole(ids, roleName) {
  if (!ids || ids.length === 0) return;
  const users = await User.find({ _id: { $in: ids } }).populate('role', 'name');
  const invalid = users.filter(u => !u.role || u.role.name !== roleName);
  if (invalid.length) {
    throw new Error(`Users not ${roleName}s: ${invalid.map(u => u._id).join(', ')}`);
  }
}

// Helper: Validate patient caregiver rules
async function validatePatientDoc(doc) {
  const hasCaretaker = !!doc.caretaker;
  const hasNurses = Array.isArray(doc.assignedNurses) && doc.assignedNurses.length > 0;

  if (!hasCaretaker && !hasNurses) {
    throw new Error('Patient must have at least one nurse or a caretaker.');
  }

  await assertUsersHaveRole([doc.caretaker].filter(Boolean), 'caretaker');
  await assertUsersHaveRole(doc.assignedNurses, 'nurse');
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

    const merged = {
      caretaker: $set.caretaker !== undefined ? $set.caretaker : current?.caretaker,
      assignedNurses: $set.assignedNurses !== undefined ? $set.assignedNurses : current?.assignedNurses || []
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

module.exports = mongoose.model('Patient', PatientSchema);
