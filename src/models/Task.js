const mongoose = require('mongoose');

const TaskSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  dueDate: { type: Date, required: true },
  priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
  status: { type: String, enum: ['pending', 'in progress', 'completed'], default: 'pending' },
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  assignee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  created_at: { type: Date, default: Date.now },
  report: { type: String },
  updated_at: { type: Date, default: Date.now }
});

TaskSchema.pre('save', function (next) {
  this.updated_at = Date.now();
  next();
});

TaskSchema.index({ assignee: 1, dueDate: 1 });
TaskSchema.index({ assignee: 1, priority: 1 });
TaskSchema.index({ assignee: 1, status: 1 });
TaskSchema.index({ patient: 1 });

const Task = mongoose.model('Task', TaskSchema);

module.exports = Task;
