const mongoose = require('mongoose');

const CarePlanSchema = new mongoose.Schema({
  title: { type: String, required: true },
  tasks: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Task' }],
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
});

CarePlanSchema.pre('save', function(next) {
  this.updated_at = Date.now();
  next();
});

const CarePlan = mongoose.model('CarePlan', CarePlanSchema);

module.exports = CarePlan;
