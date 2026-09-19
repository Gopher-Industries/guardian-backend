const mongoose = require('mongoose');

const DoctorLetterSchema = new mongoose.Schema({
  patient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    required: true
  },

  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  patientName: {
    type: String,
    required: true
  },

  doctorName: {
    type: String,
    required: true
  },

  subject: {
    type: String,
    default: 'Medical Letter'
  },

  letterContent: {
    type: String,
    required: true
  },

  fileName: {
    type: String,
    required: true
  },

  mimeType: {
    type: String,
    default: 'application/pdf'
  },

  fileData: {
    type: Buffer,
    required: true
  },

  createdAt: {
    type: Date,
    default: Date.now
  }
});

const DoctorLetter = mongoose.model('DoctorLetter', DoctorLetterSchema);

module.exports = DoctorLetter;