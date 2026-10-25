const mongoose = require('mongoose');

const CarePlanSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, default: '', trim: true },

  tasks: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Task' }],
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  provider: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  // NOTE: the ERD marks Diagnosis as a UUID (relational) field, but there is
  // no Diagnosis collection anywhere in this codebase. Stored as a plain
  // string for now, matching how it's stored on ManagementPlan so the two
  // can be compared directly. Flag with Sam if a real Diagnosis collection
  // is expected later.
  diagnosis: { type: String, default: '', trim: true },

  // ERD marks these two as JSON, not UUID, so they're stored as flexible
  // blobs rather than normalized references to other collections.
  prescriptions: { type: mongoose.Schema.Types.Mixed, default: [] },
  reviewDate: { type: Date, default: null },
  relatedAppointments: { type: mongoose.Schema.Types.Mixed, default: [] },

  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
});

CarePlanSchema.pre('save', function (next) {
  this.updated_at = Date.now();
  next();
});

CarePlanSchema.pre('findOneAndUpdate', function (next) {
  this.set({ updated_at: Date.now() });
  next();
});

CarePlanSchema.index({ patient: 1, created_at: -1 });
CarePlanSchema.index({ provider: 1, created_at: -1 });
CarePlanSchema.index({ diagnosis: 1 });

const CarePlan = mongoose.model('CarePlan', CarePlanSchema);

module.exports = CarePlan;