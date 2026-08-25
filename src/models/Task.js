const mongoose = require('mongoose');

const TaskSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  dueDate: { type: Date, required: true },
  priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
  status: { type: String, enum: ['pending', 'in progress', 'completed'], default: 'pending' },
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', default: null },
  assignee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  relatedStaff: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  objectives: [{ type: String, trim: true }],
  deliverables: [{ type: String, trim: true }],
  setBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, immutable: true },
  caretaker: { type: mongoose.Schema.Types.ObjectId, ref: 'User', select: false },
  nurse_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', select: false },
  created_at: { type: Date, default: Date.now, immutable: true },
  report: { type: String },
  updated_at: { type: Date, default: Date.now }
});

TaskSchema.pre('validate', function (next) {
  if (!this.title && this.description) {
    this.title = this.description;
  }

  if (!this.assignee) {
    this.assignee = this.nurse_id || this.caretaker;
  }

  next();
});

TaskSchema.pre('save', function (next) {
  this.updated_at = Date.now();
  next();
});

TaskSchema.pre('findOneAndUpdate', function (next) {
  this.set({ updated_at: Date.now() });
  next();
});

TaskSchema.index({ assignee: 1, dueDate: 1 });
TaskSchema.index({ assignee: 1, priority: 1 });
TaskSchema.index({ assignee: 1, status: 1 });
TaskSchema.index({ relatedStaff: 1, status: 1 });
TaskSchema.index({ patient: 1 });
TaskSchema.index({ caretaker: 1, dueDate: 1 });
TaskSchema.index({ caretaker: 1, priority: 1 });
TaskSchema.index({ caretaker: 1, status: 1 });
TaskSchema.index({ nurse_id: 1, status: 1 });
TaskSchema.index({ status: 1 });

const Task = mongoose.model('Task', TaskSchema);

module.exports = Task;
