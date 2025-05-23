const { sendPasswordResetEmail, sendPinCodeVerificationEmail } = require('../utils/mailer');

async function sendResetEmail(email, firstName, token) {
  return await sendPasswordResetEmail(email, firstName, token);
}

async function sendOTPVerificationEmail(email, firstName, otp) {
  return await sendPinCodeVerificationEmail(email, firstName, otp);
}

module.exports = {
  sendResetEmail,
  sendOTPVerificationEmail
};