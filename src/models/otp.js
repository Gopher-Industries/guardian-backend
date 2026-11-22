const crypto = require('crypto');
const mongoose = require('mongoose');

const OTPSchema = new mongoose.Schema({
  email: { type: String, required: true },
  // Only a keyed hash of the code is stored, never the code itself.
  otpHash: { type: String, required: true },
  // Wrong guesses so far; the code is thrown away after MAX_OTP_ATTEMPTS.
  attempts: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now, expires: 300 } // OTP expires after 5 minutes (300 seconds)
});

OTPSchema.index({ email: 1 });

const OTP = mongoose.model('OTP', OTPSchema);

const MAX_OTP_ATTEMPTS = 5;

// Random 6-digit code from a secure source.
const generateOTP = () => String(crypto.randomInt(100000, 1000000));

const hashOTP = (otp) => crypto
  .createHmac('sha256', process.env.JWT_SECRET || 'otp')
  .update(String(otp))
  .digest('hex');

// Constant-time compare of a submitted code against the stored hash.
const otpMatches = (otp, otpHash) => {
  const given = Buffer.from(hashOTP(otp), 'hex');
  const stored = Buffer.from(String(otpHash || ''), 'hex');
  return given.length === stored.length && crypto.timingSafeEqual(given, stored);
};

module.exports = { OTP, generateOTP, hashOTP, otpMatches, MAX_OTP_ATTEMPTS };
