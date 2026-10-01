const mongoose = require('mongoose');

const RoomSchema = new mongoose.Schema({
  location: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Location',
    required: false
  },

  roomNo: {
    type: Number,
    required: false
  },

  floor: {
    type: Number,
    required: false
  },

  wing: {
    type: String,
    required: false
  },

  created_at: {
    type: Date,
    default: Date.now
  },

  updated_at: {
    type: Date,
    default: Date.now
  }
});

RoomSchema.pre('save', function (next) {
  this.updated_at = Date.now();
  next();
});

const Room = mongoose.model('Room', RoomSchema);

module.exports = Room;