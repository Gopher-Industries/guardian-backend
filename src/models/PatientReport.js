const mongoose = require('mongoose');

const patientReportSchema = new mongoose.Schema({
  patient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    required: true,
  },
  caretaker: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Caretaker',
    required: true,
  },
  reportDetails: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('PatientReport', patientReportSchema);
