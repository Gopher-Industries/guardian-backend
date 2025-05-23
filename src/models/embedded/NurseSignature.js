const mongoose = require('mongoose');

const NurseSignatureSchema = new mongoose.Schema({
  id: { type: mongoose.Schema.Types.ObjectId, ref: 'Nurse', required: true },
  name: { type: String, required: true },
  signedAt: { type: Date, required: true, immutable: true }
}, { _id: false });

module.exports = NurseSignatureSchema;