const mongoose = require('mongoose');
const Text = require('./embedded/TextSchema');
const RevisionSchema = require('./embedded/RevisionSchema');
const ReviewerSignatureSchema = require('./embedded/ReviewerSignature');

const TaskSchema = new mongoose.Schema({
  description: { type: Text, required: true },
  dueDate: { type: Date, required: true },
  priority: { type: Text, enum: ['low', 'medium', 'high'], default: 'medium'  },
  status: { type: Text, enum: ['pending', 'in progress', 'completed'], default: 'pending' },
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  caretaker: { type: mongoose.Schema.Types.ObjectId, ref: 'Caretaker', required: true },
  nurse: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Assigned nurse
  pharmacist: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Assigned pharmacist
  report: { type: Text }, // Task report provided by caretaker
  revisionHistory: [RevisionSchema],
  signedBy: { type: ReviewerSignatureSchema, required: true, immutable: true },
}, {
  timestamps: true, // Automatically handles createdAt and updatedAt
});

TaskSchema.pre('save', function (next) {
  this.updated_at = Date.now();
  next();
});

const Task = mongoose.model('Task', TaskSchema);

module.exports = Task;
