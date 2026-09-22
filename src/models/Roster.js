const mongoose = require('mongoose');

const RosterSchema = new mongoose.Schema(
  {
    shiftId: {
      type: String,
      required: true,
      unique: true,
      immutable: true,
      trim: true
    },

    location: {
      type: String,
      required: true,
      trim: true
    },

    room: {
      type: String,
      required: true,
      trim: true
    },

    description: {
      type: String,
      required: true,
      trim: true
    },

    generalNotes: {
      type: String,
      default: '',
      trim: true
    },

    date: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/
    },

    startTime: {
      type: String,
      required: true,
      match: /^([01]\d|2[0-3]):[0-5]\d$/
    },

    endTime: {
      type: String,
      required: true,
      match: /^([01]\d|2[0-3]):[0-5]\d$/
    },

    clockOnTime: {
      type: Date,
      default: null
    },

    clockOffTime: {
      type: Date,
      default: null
    },

    assignedStaff: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    }
  },
  {
    timestamps: {
      createdAt: 'created_at',
      updatedAt: 'updated_at'
    }
  }
);

RosterSchema.index({ assignedStaff: 1, date: 1 });
RosterSchema.index({ date: 1, startTime: 1 });

const Roster = mongoose.model('Roster', RosterSchema);

module.exports = Roster;