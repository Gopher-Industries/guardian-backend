const mongoose = require('mongoose');

const backendBridgeAlertSchema = new mongoose.Schema({

  subject_id: {
    type: String,
    required: true
  },

  note_id: {
    type: String
  },

  model: {
    type: String
  },

  final_alert: {
    type: String,
    required: true
  },

  combined_score: {
    type: Number
  },

  text_concern: {
    type: mongoose.Schema.Types.Mixed
  },

  vitals_risk: {
    type: mongoose.Schema.Types.Mixed
  },

  anomaly_flag: {
    type: Boolean
  },

  anomaly_type: {
    type: String
  },

  borderline: {
    type: Boolean
  },

  explanation: {
    type: String
  },

  // Stores the COMPLETE prediction row
  // sent by the Python Backend Bridge
  raw_data: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },

  // Server-generated timestamp
  recorded_at: {
    type: Date,
    default: Date.now
  }

});


module.exports = mongoose.model(
  'BackendBridgeAlert',
  backendBridgeAlertSchema
);