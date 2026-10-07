const mongoose = require('mongoose');

const CarePlanSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, default: '', trim: true },
  tasks: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Task' }],
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  caretaker: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  nurse: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
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

CarePlanSchema.index(
  { patient: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: 'active' } }
);
CarePlanSchema.index({ patient: 1, created_at: -1 });
CarePlanSchema.index({ caretaker: 1, status: 1 });
CarePlanSchema.index({ nurse: 1, status: 1 });
CarePlanSchema.index({ author: 1, created_at: -1 });

const CarePlan = mongoose.model('CarePlan', CarePlanSchema);

module.exports = CarePlan;
