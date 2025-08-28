const mongoose = require('mongoose');

const RiskComponentSchema = new mongoose.Schema({
  item: { type: String, required: true },      // e.g. "Age"
  choice: { type: String, required: true },    // e.g. "3-7"
  points: { type: Number, required: true }
}, { _id: false });

const RiskAssessmentSchema = new mongoose.Schema({
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  type: { type: String, enum: ['humpty-dumpty'], required: true },
  score: { type: Number, required: true },
  band: { type: String, enum: ['low', 'high'], required: true },
  components: { type: [RiskComponentSchema], default: [] },
  assessedAt: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('RiskAssessment', RiskAssessmentSchema);
