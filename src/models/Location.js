const mongoose = require('mongoose');

const LocationSchema = new mongoose.Schema(
  {
    nameOfBuilding: {
      type: String,
      required: true,
      trim: true
    },

    address: {
      type: String,
      required: true,
      trim: true
    },

    openingHours: {
      type: String,
      required: true
    },

    contactNumber: {
      type: String,
      required: true
    },

    numberOfDoctors: {
      type: Number,
      default: 0
    },

    numberOfNurses: {
      type: Number,
      default: 0
    },

    numberOfRooms: {
      type: Number,
      default: 0
    },

    patientCapacity: {
      type: Number,
      default: 0
    },

    currentOccupancy: {
      type: Number,
      default: 0
    },

    equipment: {
      type: String
    },

    facilities: {
      type: String
    },

    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active'
    }
  },
  {
    timestamps: true
  }
);
LocationSchema.index({ status: 1 });
module.exports = mongoose.model('Location', LocationSchema);