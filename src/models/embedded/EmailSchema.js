const mongoose = require('mongoose');

const EmailSchema = new mongoose.Schema({
  address: {
    type: String,
    lowercase: true,
    trim: true,
    match: [/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/, 'Invalid email address']
  },
  verified: { type: Boolean, default: false }
}, { _id: false });

module.exports = EmailSchema;