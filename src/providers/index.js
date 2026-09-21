/**
 * Guardian Email Service — index.js
 *
 * Provider dispatcher. Maps EMAIL_PROVIDER to the correct transport adapter and exposes a uniform send / verify interface to the service layer.
 *
 * Author: Graeme Thomas
 * Date:   2026-08-08
 */

const { sendWithResend } = require('./resendProvider');
const { sendWithBrevo, verifyBrevoConnection } = require('./brevoProvider');
const { sendWithMailerSend } = require('./mailersendProvider');
const { sendWithSmtp, verifySmtpConnection } = require('./smtpProvider');
const { sendWithDryRun } = require('./dryRunProvider');

const PROVIDERS = {
  resend: sendWithResend,
  brevo: sendWithBrevo,
  mailersend: sendWithMailerSend,
  smtp: sendWithSmtp,
  dryrun: sendWithDryRun
};

// Only providers that can be checked without sending appear here.
const VERIFIERS = {
  smtp: verifySmtpConnection,
  brevo: verifyBrevoConnection
};

function resolveProvider(name) {
  const send = PROVIDERS[String(name).toLowerCase()];

  if (!send) {
    const error = new Error(
      `Unknown email provider "${name}". Supported: ${Object.keys(PROVIDERS).join(', ')}.`
    );
    error.statusCode = 400;
    throw error;
  }

  return send;
}

/**
 * Runs a connection check where the provider supports one.
 * HTTP API providers have no equivalent to an SMTP handshake, so they report
 * as unsupported rather than failing.
 */
async function verifyProviderConnection(config) {
  const verify = VERIFIERS[String(config.provider).toLowerCase()];

  if (!verify) {
    return {
      ok: null,
      provider: config.provider,
      supported: false,
      message: `Connection verification is not available for "${config.provider}". Send a dry run or a test message instead.`
    };
  }

  const result = await verify(config);
  return { ...result, supported: true };
}

module.exports = { PROVIDERS, VERIFIERS, resolveProvider, verifyProviderConnection };
