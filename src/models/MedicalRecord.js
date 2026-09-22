const mongoose = require('mongoose');

const { Schema } = mongoose;

const MedicalRecordSchema = new Schema(
  {
    patient: {
      type: Schema.Types.ObjectId,
      ref: 'Patient',
      required: true,
      index: true
    },

    doctor: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },

    organization: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true
    },

    location: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200
    },

    clinic: {
      type: String,
      trim: true,
      maxlength: 200,
      default: ''
    },

    room: {
      type: String,
      trim: true,
      maxlength: 100,
      default: ''
    },

    // Kept as the main sortable datetime used by the API/database.
    appointmentDateTime: {
      type: Date,
      required: true,
      index: true
    },

    // These two fields mirror the layout Sam supplied and are automatically
    // derived from appointmentDateTime before validation.
    appointmentDate: {
      type: String,
      default: null
    },

    appointmentTime: {
      type: String,
      default: null
    },

    startTime: {
      type: Date,
      default: null
    },

    endTime: {
      type: Date,
      default: null
    },

    // Saved in minutes.
    totalConsultationTime: {
      type: Number,
      default: null,
      min: 0
    },

    // Private consultation/medical information.
    generalNotes: {
      type: String,
      default: null,
      trim: true,
      select: false
    },

    symptoms: {
      type: [{ type: String, trim: true }],
      default: [],
      select: false
    },

    // Readable snapshot of the Vital record created for this consultation.
    vitals: {
      type: String,
      default: null,
      select: false
    },

    tests: {
      type: String,
      default: null,
      trim: true,
      select: false
    },

    diagnosis: {
      type: String,
      default: null,
      trim: true,
      select: false
    },

    // Kept for compatibility with the current implementation.
    clinicalNotes: {
      type: String,
      default: null,
      trim: true,
      select: false
    },

    referrals: {
      type: String,
      default: null,
      trim: true,
      select: false
    },

    // Readable snapshot of Prescription records created for this consultation.
    // The actual prescriptions are still stored in the Prescription collection.
    prescriptions: {
      type: String,
      default: null,
      select: false
    },

    // Care Plans remain references for now, as requested.
    carePlans: {
      type: [{ type: Schema.Types.ObjectId, ref: 'CarePlan' }],
      default: [],
      select: false
    },

    recommendations: {
      type: String,
      default: null,
      trim: true,
      select: false
    },

    // Kept for compatibility with the existing API.
    followUp: {
      type: String,
      default: null,
      trim: true,
      select: false
    },

    status: {
      type: String,
      enum: ['booked', 'in-progress', 'completed'],
      default: 'booked',
      index: true
    },

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },

    startedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },

    completedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null
    }
  },
  {
    timestamps: {
      createdAt: 'created_at',
      updatedAt: 'updated_at'
    }
  }
);

MedicalRecordSchema.pre('validate', function (next) {
  if (this.appointmentDateTime) {
    const appointment = new Date(this.appointmentDateTime);

    if (!Number.isNaN(appointment.getTime())) {
      const iso = appointment.toISOString();
      this.appointmentDate = iso.slice(0, 10);
      this.appointmentTime = iso.slice(11, 16);
    }
  }

  if (this.endTime && !this.startTime) {
    return next(
      new Error('The consultation cannot finish before it starts.')
    );
  }

  if (
    this.startTime &&
    this.endTime &&
    this.endTime.getTime() < this.startTime.getTime()
  ) {
    return next(
      new Error('The end time cannot be before the start time.')
    );
  }

  if (this.status === 'booked') {
    if (this.startTime || this.endTime) {
      return next(
        new Error('A booked appointment cannot have start or end times.')
      );
    }

    this.totalConsultationTime = null;
  }

  if (this.status === 'in-progress') {
    if (!this.startTime || this.endTime) {
      return next(
        new Error(
          'An in-progress consultation must have a start time and no end time.'
        )
      );
    }

    if (!this.startedBy) {
      return next(
        new Error('The user who started the consultation is required.')
      );
    }

    this.totalConsultationTime = null;
  }

  if (this.status === 'completed') {
    if (!this.startTime || !this.endTime) {
      return next(
        new Error(
          'A completed consultation must have a start time and end time.'
        )
      );
    }

    if (!this.startedBy || !this.completedBy) {
      return next(
        new Error(
          'The users who started and completed the consultation are required.'
        )
      );
    }

    const duration = this.endTime.getTime() - this.startTime.getTime();
    this.totalConsultationTime = Math.ceil(duration / (1000 * 60));
  }

  next();
});

MedicalRecordSchema.index({
  patient: 1,
  appointmentDateTime: -1
});

MedicalRecordSchema.index({
  doctor: 1,
  appointmentDateTime: -1
});

MedicalRecordSchema.index({
  organization: 1,
  status: 1,
  appointmentDateTime: -1
});

MedicalRecordSchema.set('toJSON', {
  versionKey: false,
  transform: (_doc, record) => {
    record.id = String(record._id);
    return record;
  }
});

module.exports = mongoose.model('MedicalRecord', MedicalRecordSchema);
