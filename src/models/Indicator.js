const mongoose = require('mongoose');

// Nested sub-document: a single staff response to an indicator.
// Embedded (not a separate collection) because actions are always
// read/written together with their parent indicator.
const ActionSchema = new mongoose.Schema(
  {
    action_type: { type: String, required: true, trim: true }, // e.g. "monitored", "notified_doctor", "medication_adjusted"
    description: { type: String, default: '', trim: true },
    performed_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    performed_at: { type: Date, default: Date.now },
    outcome_notes: { type: String, default: '', trim: true }
  },
  { _id: true }
);

const IndicatorSchema = new mongoose.Schema({
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  careplan: { type: mongoose.Schema.Types.ObjectId, ref: 'CarePlan', default: null }, // optional link

  indicator_type: { type: String, required: true, trim: true }, // e.g. "fatigue", "pain", "confusion"
  severity: { type: String, enum: ['low', 'moderate', 'high'], default: 'low' },
  notes: { type: String, default: '', trim: true },

  recorded_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  recorded_at: { type: Date, default: Date.now },

  status: { type: String, enum: ['open', 'resolved'], default: 'open' },

  actions: [ActionSchema],

  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
});

IndicatorSchema.pre('save', function (next) {
  this.updated_at = Date.now();
  next();
});

IndicatorSchema.pre('findOneAndUpdate', function (next) {
  this.set({ updated_at: Date.now() });
  next();
});

IndicatorSchema.index({ patient: 1, status: 1 });
IndicatorSchema.index({ careplan: 1, status: 1 });
IndicatorSchema.index({ recorded_by: 1, created_at: -1 });

const Indicator = mongoose.model('Indicator', IndicatorSchema);

module.exports = Indicator;