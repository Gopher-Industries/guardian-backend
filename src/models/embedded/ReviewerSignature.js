const mongoose = require('mongoose');

const ReviewerSignatureSchema = new mongoose.Schema({
  id: { type: mongoose.Schema.Types.ObjectId, refPath: 'signedByModel', required: true },
  name: { type: String, required: true },
  signedAt: { type: Date, required: true, immutable: true },
  signedByModel: { type: String, enum: ['Pharmacist', 'Nurse'], required: true }
}, { _id: false });

module.exports = ReviewerSignatureSchema;