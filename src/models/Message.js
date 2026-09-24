const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  organization: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true
  },

  message: {
    type: String,
    required: true,
    trim: true,
    maxlength: 5000
  },

  created_at: {
    type: Date,
    default: Date.now
  },

  updated_at: {
    type: Date,
    default: Date.now
  },

  read_at: {
    type: Date,
    default: null
  }
});

MessageSchema.pre('save', function (next) {
  this.updated_at = Date.now();
  next();
});

MessageSchema.index({
  sender: 1,
  recipient: 1,
  created_at: -1
});

MessageSchema.index({
  organization: 1,
  created_at: -1
});

module.exports = mongoose.model('Message', MessageSchema);