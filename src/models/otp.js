const mongoose = require('mongoose');

const OTPSchema = new mongoose.Schema({
  email: { type: String, required: true },
  otp: { type: String, required: true },
  createdAt: { type: Date, default: Date.now, expires: 300 } // OTP expires after 5 minutes (300 seconds)
});

const OTP = mongoose.model('OTP', OTPSchema);

// Helper function to generate random 6-digit OTP
const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

module.exports = { OTP, generateOTP };
