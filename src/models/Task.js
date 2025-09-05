const mongoose = require('mongoose');

const TaskSchema = new mongoose.Schema({
  description: { type: String, required: true },
  dueDate: { type: Date, required: true },
  priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium'  },
  status: { type: String, enum: ['pending', 'in progress', 'completed'], default: 'pending' },
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  caretaker: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  nurse_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Assigned nurse
  created_at: { type: Date, default: Date.now },
  report: { type: String }, // Task report provided by caretaker
  updated_at: { type: Date, default: Date.now }
});

TaskSchema.pre('save', function (next) {
  this.updated_at = Date.now();
  next();
});
TaskSchema.index({ caretaker: 1, dueDate: 1 });
TaskSchema.index({ caretaker: 1, priority: 1 });
TaskSchema.index({ caretaker: 1, status: 1 });

const Task = mongoose.model('Task', TaskSchema);

module.exports = Task;
