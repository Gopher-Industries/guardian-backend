const mongoose = require('mongoose');

const ClinicSchema = new mongoose.Schema(
  {
    location: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Location'
    },

    rooms: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Room'
    },

    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization'
    },

    title: {
      type: String,
      required: true
    },

    description: {
      type: String
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('Clinic', ClinicSchema);