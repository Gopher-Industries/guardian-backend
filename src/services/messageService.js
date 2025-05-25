
const Message = require('../models/Message');

async function sendMessage(senderId, recipientId, content, senderName) {
  const message = new Message({
    sender: senderId,
    recipient: recipientId,
    content,
    signedBy: {
      id: senderId,
      name: senderName,
      signedAt: new Date()
    },
    read: false
  });

  await message.save();
  return message;
}

async function getMessagesForUser(userId) {
  return await Message.find({ recipient: userId }).sort({ createdAt: -1 });
}

async function getUnreadMessages(userId) {
  return await Message.find({ recipient: userId, read: false });
}

async function getReadMessagesFiltered(userId, filters = {}) {
  const query = { recipient: userId, read: true };

  if (filters.text) {
    query.content = { $regex: filters.text, $options: 'i' };
  }

  if (filters.startDate || filters.endDate) {
    query.createdAt = {};
    if (filters.startDate) query.createdAt.$gte = new Date(filters.startDate);
    if (filters.endDate) query.createdAt.$lte = new Date(filters.endDate);
  }

  return await Message.find(query).sort({ createdAt: -1 });
}

module.exports = {
  sendMessage,
  getMessagesForUser,
  getUnreadMessages,
  getReadMessagesFiltered
};