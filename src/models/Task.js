const mongoose = require('mongoose');

const TaskSchema = new mongoose.Schema({
  description: { type: String, required: true },
  dueDate: { type: Date, required: true },
  priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium'  },
  status: { type: String, enum: ['pending', 'in progress', 'completed'], default: 'pending' },
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  caretaker: { type: mongoose.Schema.Types.ObjectId, ref: 'Caretaker', required: true },
  nurse: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Assigned nurse
  pharmacist: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Assigned pharmacist
  report: { type: String } // Task report provided by caretaker
}, {
  timestamps: true, // Automatically handles createdAt and updatedAt
});

TaskSchema.pre('save', function (next) {
  this.updated_at = Date.now();
  next();
});

const Task = mongoose.model('Task', TaskSchema);

module.exports = Task;
