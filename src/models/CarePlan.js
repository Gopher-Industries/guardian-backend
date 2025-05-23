const mongoose = require('mongoose');

const CarePlanSchema = new mongoose.Schema({
  planTitle: { type: String, required: true },
  objectives: [{ type: String }],
  interventions: [{ type: String }],
  goals: [{ type: String }],
  notes: { type: String },
  tasks: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Task' }],
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  caretaker: { type: mongoose.Schema.Types.ObjectId, ref: 'Caretaker' },
  nurse: { type: mongoose.Schema.Types.ObjectId, ref: 'Nurse' },
  pharmacist: { type: mongoose.Schema.Types.ObjectId, ref: 'Pharmacist' }
}, { timestamps: true });

module.exports = mongoose.model('CarePlan', CarePlanSchema);