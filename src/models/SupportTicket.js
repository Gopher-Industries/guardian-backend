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
