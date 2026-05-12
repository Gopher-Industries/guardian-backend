const mongoose = require('mongoose');

const ActivityRecognitionSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: false },
  wifi_csi_id: { type: mongoose.Schema.Types.ObjectId, ref: 'WifiCSI', required: true },
  activity_type: { type: String, required: true },
  confidence: { type: Number, required: true },  // Confidence score for the activity
  detected_at: { type: Date, required: true },
  created_at: { type: Date, default: Date.now }
});

const ActivityRecognition = mongoose.model('ActivityRecognition', ActivityRecognitionSchema);

module.exports = ActivityRecognition;
