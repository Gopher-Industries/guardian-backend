/**
 * Guardian Email Service — smtpProvider.js
 *
 * SMTP transport adapter built on nodemailer. Used for local mail catchers such as Mailpit and for corporate / Microsoft 365 relays; also implements the connection-verification handshake.
 *
 * Author: Graeme Thomas
 * Date:   2026-08-08
 */

/**
 * SMTP provider adapter (nodemailer).
 *
 * Primary use is a local catcher such as Mailpit or MailHog, which gives you
 * a browsable inbox for every message the backend produces during development
 * without any provider account. It also works against a corporate relay or
 * Microsoft 365 if you would rather not use a hosted API provider.
 *
 * The SDK is required lazily so the backend still boots without nodemailer
 * installed when a different provider is selected.
 */

let cachedTransport = null;
let cachedKey = null;

function loadNodemailer() {
  try {
    // eslint-disable-next-line global-require
    return require('nodemailer');
  } catch (error) {
    const err = new Error("The 'nodemailer' package is not installed. Run: npm install nodemailer");
    err.statusCode = 501;
    throw err;
  }
}

/**
 * Transports are pooled and reused between sends. The cache key covers every
 * setting that affects the connection, so changing configuration rebuilds it.
 */
function getTransport(config) {
  const nodemailer = loadNodemailer();

  const options = {
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    pool: config.smtpPool,
    tls: { rejectUnauthorized: config.smtpRejectUnauthorized },
    ignoreTLS: config.smtpIgnoreTls,
    connectionTimeout: config.smtpTimeoutMs,
    greetingTimeout: config.smtpTimeoutMs,
    socketTimeout: config.smtpTimeoutMs
  };

  // Mailpit and MailHog accept anonymous connections.
  if (config.smtpUser) {
    options.auth = { user: config.smtpUser, pass: config.smtpPassword };
  }

  const key = JSON.stringify([
    options.host,
    options.port,
    options.secure,
    options.pool,
    config.smtpUser,
    config.smtpRejectUnauthorized,
    config.smtpIgnoreTls
  ]);

  if (!cachedTransport || cachedKey !== key) {
    if (cachedTransport && typeof cachedTransport.close === 'function') {
      cachedTransport.close();
    }
    cachedTransport = nodemailer.createTransport(options);
    cachedKey = key;
  }

  return cachedTransport;
}

async function sendWithSmtp(config, message) {
  if (!config.smtpHost) {
    const error = new Error('SMTP_HOST is required when EMAIL_PROVIDER is "smtp".');
    error.statusCode = 500;
    throw error;
  }

  const transport = getTransport(config);

  const payload = {
    from: message.from || `${config.senderName} <${config.fromEmail}>`,
    to: message.to.join(', '),
    subject: message.subject,
    html: message.html,
    text: message.text
  };

  if (message.replyTo) payload.replyTo = message.replyTo;
  if (message.cc && message.cc.length) payload.cc = message.cc.join(', ');
  if (message.bcc && message.bcc.length) payload.bcc = message.bcc.join(', ');
  if (message.headers && Object.keys(message.headers).length) payload.headers = message.headers;
  if (message.attachments && message.attachments.length) payload.attachments = message.attachments;

  try {
    const info = await transport.sendMail(payload);

    return {
      provider: 'smtp',
      messageId: info.messageId,
      raw: {
        response: info.response,
        accepted: info.accepted,
        rejected: info.rejected
      }
    };
  } catch (error) {
    const err = new Error(error.message || 'SMTP failed to send the email.');
    err.statusCode = 502;
    err.provider = 'smtp';
    err.smtpCode = error.code;
    throw err;
  }
}

/**
 * Opens a connection and runs the SMTP handshake without sending anything.
 * Useful for confirming the catcher or relay is reachable before you debug
 * a template.
 */
async function verifySmtpConnection(config) {
  if (!config.smtpHost) {
    const error = new Error('SMTP_HOST is not configured.');
    error.statusCode = 400;
    throw error;
  }

  const transport = getTransport(config);

  try {
    await transport.verify();
    return {
      ok: true,
      provider: 'smtp',
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpSecure,
      authenticated: Boolean(config.smtpUser)
    };
  } catch (error) {
    return {
      ok: false,
      provider: 'smtp',
      host: config.smtpHost,
      port: config.smtpPort,
      error: error.message,
      code: error.code
    };
  }
}

/** Drops the pooled transport. Called by the tests. */
function resetSmtpTransport() {
  if (cachedTransport && typeof cachedTransport.close === 'function') {
    cachedTransport.close();
  }
  cachedTransport = null;
  cachedKey = null;
}

module.exports = { sendWithSmtp, verifySmtpConnection, resetSmtpTransport };
