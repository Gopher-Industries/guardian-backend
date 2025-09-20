const mongoose = require('mongoose');

const OrganizationSchema = new mongoose.Schema({
  // Org display name → must be unique
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    maxlength: 100
  },

  // Small description or about text
  description: {
    type: String,
    default: '',
    maxlength: 1000
  },

  // Org active flag → if false, org is disabled
  active: {
    type: Boolean,
    default: true
  },

  // Which user created this org (usually an admin)
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  // STAFF list for this org → only nurses & doctors go here
  // caretakers are linked via User.organization instead
  staff: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],

  // basic timestamps
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
});

// auto update updated_at before save
OrganizationSchema.pre('save', function (next) {
  this.updated_at = Date.now();
  next();
});

// helper to add user to staff → safe if already exists
OrganizationSchema.statics.addStaff = function (orgId, userId) {
  return this.findByIdAndUpdate(
    orgId,
    {
      $addToSet: { staff: userId }, // add only if not present
      $set: { updated_at: Date.now() }
    },
    { new: true }
  );
};

// helper to remove user from staff
OrganizationSchema.statics.removeStaff = function (orgId, userId) {
  return this.findByIdAndUpdate(
    orgId,
    {
      $pull: { staff: userId }, // remove if exists
      $set: { updated_at: Date.now() }
    },
    { new: true }
  );
};

// virtual property → staff count
OrganizationSchema.virtual('staffCount').get(function () {
  return Array.isArray(this.staff) ? this.staff.length : 0;
});

// show virtuals in JSON and objects
OrganizationSchema.set('toJSON', { virtuals: true });
OrganizationSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Organization', OrganizationSchema);
