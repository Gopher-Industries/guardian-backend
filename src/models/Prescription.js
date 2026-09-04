const mongoose = require('mongoose');

const PrescriptionItemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },          // medicine name
    dose: { type: String, required: true },          // dosage info
    frequency: { type: String, required: true },     // how often to take
    durationDays: { type: Number, required: true },  // number of days
    quantity: { type: Number },                      // optional total units
    instructions: { type: String },                  // optional extra guidance
  },
  { _id: false } // no need for separate _id per item
);

const PrescriptionSchema = new mongoose.Schema(
  {
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Patient',
      required: true,
    },
    prescriber: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    items: {
      type: [PrescriptionItemSchema],
      validate: {
        validator: function (val) {
          return Array.isArray(val) && val.length > 0;
        },
        message: 'At least one prescription item is required',
      },
    },
    notes: { type: String },
    status: {
      type: String,
      enum: ['active', 'discontinued', 'completed'],
      default: 'active',
    },

    medicationName: {
      type: String,
    },

    dose: {
      type: String,
    },

    howMany: {
      type: Number,
    },

    timesPerDay: {
      type: Number,
    },

    timesOfDay: {
      type: [String],
      default: [],
    },

    comment: {
      type: String,
    },
  },
  { timestamps: true } // adds createdAt & updatedAt
);

PrescriptionSchema.index({ patient: 1, status: 1 });
PrescriptionSchema.index({ prescriber: 1 });

module.exports = mongoose.model('Prescription', PrescriptionSchema);
