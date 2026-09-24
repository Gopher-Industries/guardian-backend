const mongoose = require('mongoose');

const ManagementPlanSchema = new mongoose.Schema({
  care_plan: { type: mongoose.Schema.Types.ObjectId, ref: 'CarePlan', required: true },

  // Natural key. Only one management plan may exist per diagnosis.
  diagnosis: { type: String, required: true, trim: true, unique: true },

  management: { type: String, default: '', trim: true },

  // Free-text audit log. Each entry gets the current server date
  // prepended automatically whenever the plan is edited.
  changes_logged: { type: [String], default: [] },

  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
});

ManagementPlanSchema.pre('save', function (next) {
  this.updated_at = Date.now();
  next();
});

ManagementPlanSchema.pre('findOneAndUpdate', function (next) {
  this.set({ updated_at: Date.now() });
  next();
});

const ManagementPlan = mongoose.model('ManagementPlan', ManagementPlanSchema);

module.exports = ManagementPlan;