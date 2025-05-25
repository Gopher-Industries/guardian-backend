const mongoose = require('mongoose');

const RevisionSchema = new mongoose.Schema({
  updatedBy: {
    id: { type: mongoose.Schema.Types.ObjectId, required: true },
    name: { type: String, required: true },
    role: { type: String, required: true }
  },
  updatedAt: { type: Date, default: Date.now },
  fieldsChanged: [String],
  previousValues: mongoose.Schema.Types.Mixed
}, { _id: false });

module.exports = RevisionSchema;
