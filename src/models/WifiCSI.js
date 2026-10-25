const mongoose = require('mongoose');

const WifiCSISchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: false },
  timestamp: { type: Date, required: true },
  csi_data: { type: Object, required: true },  // Store CSI data as JSON
  created_at: { type: Date, default: Date.now }
});

const WifiCSI = mongoose.model('WifiCSI', WifiCSISchema);

module.exports = WifiCSI;
