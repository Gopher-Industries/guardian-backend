const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  title: { type: String, required: true },
  message: { type: String, required: true },
  isRead: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});


NotificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });


module.exports = mongoose.model('Notification', NotificationSchema);
