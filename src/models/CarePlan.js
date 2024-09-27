const mongoose = require('mongoose');


const CarePlanSchema = new mongoose.Schema({
  tasks: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Task' }], // List of tasks
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  caretaker: { type: mongoose.Schema.Types.ObjectId, ref: 'Caretaker', required: true },
  nurse: { type: mongoose.Schema.Types.ObjectId, ref: 'Nurse', required: true },
  created_at: { type: Date, default: Date.now }
});

const CarePlan = mongoose.model('CarePlan', CarePlanSchema);

module.exports = CarePlan;
