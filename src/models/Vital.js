const mongoose = require('mongoose');

const { Schema } = mongoose;

const VitalSchema = new Schema(
  {
    patient: {
      type: Schema.Types.ObjectId,
      ref: 'Patient',
      required: true,
      index: true
    },

    recordedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },

    temperature: {
      type: Number,
      default: null
    },

    bloodPressure: {
      type: String,
      default: null,
      trim: true
    },

    heartRate: {
      type: Number,
      default: null,
      min: 0
    },

    respiratoryRate: {
      type: Number,
      default: null,
      min: 0
    },

    oxygenSaturation: {
      type: Number,
      default: null,
      min: 0,
      max: 100
    },

    notes: {
      type: String,
      default: '',
      trim: true
    }
  },
  {
    timestamps: {
      createdAt: 'created_at',
      updatedAt: 'updated_at'
    }
  }
);

VitalSchema.index({ patient: 1, created_at: -1 });
VitalSchema.index({ recordedBy: 1, created_at: -1 });

VitalSchema.set('toJSON', {
  versionKey: false,
  transform: (_doc, vital) => {
    vital.id = String(vital._id);
    return vital;
  }
});

module.exports = mongoose.model('Vital', VitalSchema);
