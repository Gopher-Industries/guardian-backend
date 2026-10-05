const mongoose = require('mongoose');

const SupportTicketSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    subject: {
      type: String,
      required: true,
      trim: true,
    },

    description: {
      type: String,
      required: true,
      trim: true,
    },

    status: {
      type: String,
      enum: ['open', 'in_progress', 'resolved', 'closed'],
      default: 'open',
      index: true,
    },

    adminResponse: {
      type: String,
      trim: true,
      default: '',
    },

    actions: [
      {
        person: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          required: true,
        },

        actionTaken: {
          type: String,
          required: true,
          trim: true,
        },

        outcome: {
          type: String,
          trim: true,
          default: '',
        },

        resolved: {
          type: Boolean,
          default: false,
        },

        remainingWork: {
          type: String,
          trim: true,
          default: '',
        },

        created_at: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  {
    timestamps: {
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  }
);

SupportTicketSchema.index({ user: 1, created_at: -1 });
SupportTicketSchema.index({ status: 1, created_at: -1 });

module.exports = mongoose.model('SupportTicket', SupportTicketSchema);
