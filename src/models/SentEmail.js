/**
 * Guardian Email Service — SentEmail.js
 *
 * MongoDB model for the persisted "Sent" inbox. Every email the tool produces
 * (sent, dry-run, blocked or failed) is stored here so it can be browsed in any
 * environment and survives restarts, unlike the in-memory outbox.
 *
 * Author: Graeme Thomas
 * Date:   2026-08-08
 */

const mongoose = require('mongoose');

const AttachmentSchema = new mongoose.Schema(
  {
    filename: String,
    contentType: String
  },
  { _id: false }
);

const SentEmailSchema = new mongoose.Schema(
  {
    // The outbox entry id, so memory and DB records line up.
    ref: { type: String, required: true, unique: true, index: true },
    sentAt: { type: Date, default: Date.now, index: true },

    template: { type: String, index: true },
    status: { type: String, index: true }, // sent | dry-run | blocked | failed
    provider: String,
    requestedProvider: String,

    to: { type: [String], index: true },
    cc: [String],
    bcc: [String],
    blockedRecipients: [String],

    from: String,
    replyTo: String,
    subject: String,

    html: String,
    text: String,
    htmlLength: Number,
    textLength: Number,

    headers: { type: mongoose.Schema.Types.Mixed },
    attachments: [AttachmentSchema],

    messageId: String,
    durationMs: Number,
    error: String
  },
  { collection: 'sent_emails' }
);

SentEmailSchema.index({ sentAt: -1 });
SentEmailSchema.index({ subject: 'text' });

// Optional automatic clean-up. Set EMAIL_INBOX_RETENTION_DAYS to a positive
// number to have MongoDB expire old records; 0 / unset keeps them forever.
const retentionDays = Number(process.env.EMAIL_INBOX_RETENTION_DAYS || 0);
if (retentionDays > 0) {
  SentEmailSchema.index({ sentAt: 1 }, { expireAfterSeconds: retentionDays * 24 * 60 * 60 });
}

// Guard against OverwriteModelError when the module is required more than once.
module.exports = mongoose.models.SentEmail || mongoose.model('SentEmail', SentEmailSchema);
