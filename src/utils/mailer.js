/**
 * Guardian Email Service — mailer.js
 *
 * Backwards-compatible mailer facade. Preserves the original sendEmail / sendPasswordResetEmail / sendPinCodeVerificationEmail signatures while routing all delivery through the new email service.
 *
 * Author: Graeme Thomas
 * Date:   2026-08-08
 */

/**
 * Backwards-compatible mailer facade.
 *
 * REPLACES the previous MailerSend-only implementation. The three exported
 * functions keep their original signatures so existing call sites in
 * userController.js (and the mock in test/authControllerFlow.cjs) continue
 * to work unchanged. Everything now routes through emailService, which adds
 * provider choice, allowlisting, dry-run and the outbox.
 *
 * Two behavioural differences worth knowing:
 *   - Failures now reject instead of being swallowed by .catch(console.log).
 *   - The templates are the Guardian-branded ones in src/templates.
 *
 * New code should call emailService directly rather than this shim.
 */

const { sendRawEmail, sendTemplatedEmail } = require('../services/emailService');

/**
 * Sends an ad-hoc email.
 * Original signature: sendEmail(to, subject, text, html)
 */
async function sendEmail(to, subject, text, html) {
  return sendRawEmail({ to, subject, text, html }, { template: 'legacy-raw' });
}

/**
 * Sends the password reset email.
 * Original signature: sendPasswordResetEmail(to, name, token)
 */
async function sendPasswordResetEmail(to, name, token) {
  return sendTemplatedEmail('password-reset', { to, name, token });
}

/**
 * Sends the PIN verification email.
 * Original signature: sendPinCodeVerificationEmail(to, name, pinCode)
 */
async function sendPinCodeVerificationEmail(to, name, pinCode) {
  return sendTemplatedEmail('otp', { to, name, otp: pinCode });
}

module.exports = {
  sendEmail,
  sendPasswordResetEmail,
  sendPinCodeVerificationEmail
};
