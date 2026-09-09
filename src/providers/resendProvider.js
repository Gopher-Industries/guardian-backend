/**
 * Guardian Email Service — resendProvider.js
 *
 * Resend transport adapter. Lazily requires the Resend SDK and delivers a rendered message via the Resend HTTP API.
 *
 * Author: Graeme Thomas
 * Date:   2026-08-08
 */

/**
 * Resend provider adapter.
 * The SDK is required lazily so the backend still starts when the package
 * is not installed and a different provider is in use.
 */

function loadResend() {
  try {
    // eslint-disable-next-line global-require
    return require('resend').Resend;
  } catch (error) {
    const err = new Error("The 'resend' package is not installed. Run: npm install resend");
    err.statusCode = 501;
    throw err;
  }
}

async function sendWithResend(config, message) {
  const Resend = loadResend();
  const resend = new Resend(config.resendApiKey);

  const payload = {
    from: message.from || `${config.senderName} <${config.fromEmail}>`,
    to: message.to,
    subject: message.subject,
    html: message.html,
    text: message.text
  };

  if (message.replyTo) payload.replyTo = message.replyTo;
  if (message.cc && message.cc.length) payload.cc = message.cc;
  if (message.bcc && message.bcc.length) payload.bcc = message.bcc;
  if (message.headers && Object.keys(message.headers).length) payload.headers = message.headers;
  if (message.attachments && message.attachments.length) {
    payload.attachments = message.attachments.map(a => ({
      filename: a.filename,
      content: a.content,
      path: a.path || a.href,
      content_type: a.contentType
    }));
  }

  const response = await resend.emails.send(payload);

  if (response && response.error) {
    const err = new Error(response.error.message || 'Resend failed to send the email.');
    err.statusCode = 502;
    err.provider = 'resend';
    throw err;
  }

  return {
    provider: 'resend',
    messageId: response && response.data ? response.data.id : undefined,
    raw: response
  };
}

module.exports = { sendWithResend };
