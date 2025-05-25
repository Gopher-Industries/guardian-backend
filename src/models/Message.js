const mongoose = require('mongoose');
const ReviewerSignatureSchema = require('./embedded/ReviewerSignature');

const MessageSchema = new mongoose.Schema({
  sender_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  receiver_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  message: { type: String, required: true },
  read: { type: Boolean, default: false },
  readAt: { type: Date }, 
  signedBy: { type: ReviewerSignatureSchema, required: true, immutable: true },
  sent_at: { type: Date, default: Date.now }
});

const Message = mongoose.model('Message', MessageSchema);

module.exports = Message;
