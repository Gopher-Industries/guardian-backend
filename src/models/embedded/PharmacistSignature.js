const mongoose = require('mongoose');

const PharmacistSignatureSchema = new mongoose.Schema({
  id: { type: mongoose.Schema.Types.ObjectId, ref: 'Pharmacist', required: true },
  name: { type: String, required: true },
  signedAt: { type: Date, required: true, immutable: true }
}, { _id: false });

module.exports = PharmacistSignatureSchema;