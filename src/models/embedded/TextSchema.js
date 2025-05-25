const mongoose = require('mongoose');

const TextSchema = new mongoose.Schema({
  value: { type: Number },
  isValid: { type: Boolean, default: true },
  invalidReason: { type: String },
  createdBy: {
    id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    name: String,
    role: String,
    date: { type: Date, default: Date.now }
  },
  modifiedBy: {
    id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    name: String,
    role: String,
    date: Date
  }
}, { _id: false });

module.exports = TextSchema;