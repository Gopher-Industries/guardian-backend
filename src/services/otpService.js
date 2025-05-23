
const OTP = require('../models/otp');

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function storeOTP(email, otp) {
  await OTP.deleteMany({ email });
  const record = new OTP({ email, otp });
  await record.save();
}

async function verifyOTP(email, otp) {
  const match = await OTP.findOne({ email, otp });
  if (match) {
    await OTP.deleteOne({ _id: match._id });
    return true;
  }
  return false;
}

module.exports = { generateOTP, storeOTP, verifyOTP };