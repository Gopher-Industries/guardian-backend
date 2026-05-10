const mongoose = require('mongoose');

const DailyReportSchema = new mongoose.Schema({
  patient: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Patient', 
    required: true 
  },

  caretaker: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },

  summary: { type: String, required: true },

  foodWater: { type: String },

  medicationSupport: { type: String },

  mobility: { type: String },

  moodBehaviour: { type: String },

  incidents: { type: String },

  notes: { type: String },

  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('DailyReport', DailyReportSchema);