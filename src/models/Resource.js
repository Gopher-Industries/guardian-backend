const mongoose = require('mongoose');

const resourceSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true
    },
    type: {
      type: String,
      required: true,
      enum: ['caregiver', 'exercise']
    },
    description: {
      type: String,
      required: true,
      trim: true
    },
    link: {
      type: String,
      trim: true
    },
    category: {
      type: String,
      trim: true
    },
    isActive: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('Resource', resourceSchema);