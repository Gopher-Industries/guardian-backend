const mongoose = require('mongoose');

const EntryReportSchema = new mongoose.Schema({
  patient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    required: true
  },
  nurse: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  activityType: {
    type: String,
    required: true
  },
  comment: {
    type: String
  },
  activityTimestamp: {
    type: Date,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const EntryReport = mongoose.model('EntryReport', EntryReportSchema);

module.exports = EntryReport;
