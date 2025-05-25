const mongoose = require('mongoose');

const CompletionStatusSchema = new mongoose.Schema({
  isComplete: { type: Boolean, default: false },
  lastUpdatedBy: {
    id: mongoose.Schema.Types.ObjectId,
    name: String,
    role: String
  },
  markedIncompleteAt: Date,
  markedCompleteAt: Date,
  notes: String  // optional reason or comment
}, { _id: false });

module.exports = CompletionStatusSchema;
