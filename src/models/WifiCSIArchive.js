const mongoose = require('mongoose');

const WifiCSIArchiveSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: false },
  timestamp: { type: Date },
  csi_data: { type: Object },
  archived_at: { type: Date, default: Date.now }
});

const WifiCSIArchive = mongoose.model('WifiCSIArchive', WifiCSIArchiveSchema);

module.exports = WifiCSIArchive;
