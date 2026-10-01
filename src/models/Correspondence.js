const mongoose = require('mongoose');

const CorrespondenceSchema = new mongoose.Schema(
  {
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Patient',
      required: true
    },

    staff: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },

    type: {
      type: String,
      enum: [
        'letter',
        'referral',
        'specialist report',
        'discharge summary',
        'other'
      ],
      required: true
    },

    description: {
      type: String,
      trim: true
    },

    direction: {
      type: String,
      enum: ['incoming', 'outgoing'],
      required: true
    },

    date: {
      type: Date,
      required: true
    },

    cloudflareObjectKey: {
      type: String,
      required: true,
      trim: true
    }
  },
  {
    timestamps: true
  }
);

CorrespondenceSchema.index({ patient: 1, date: -1 });
CorrespondenceSchema.index({ staff: 1, date: -1 });

const Correspondence = mongoose.model('Correspondence', CorrespondenceSchema);

module.exports = Correspondence;