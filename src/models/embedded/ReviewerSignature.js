const mongoose = require('mongoose');

const ReviewerSignatureSchema = new mongoose.Schema({
  id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true },
  role: { type: String, required: true },
  signedAt: { type: Date, default: Date.now, required: true, immutable: true },
}, { _id: false });

module.exports = ReviewerSignatureSchema;