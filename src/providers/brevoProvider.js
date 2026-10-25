/**
 * Guardian Email Service — brevoProvider.js
 *
 * Brevo (Sendinblue) transport adapter. Lazily requires the Brevo SDK and delivers a rendered message via the Brevo transactional email API.
 *
 * Author: Graeme Thomas
 * Date:   2026-08-08
 */

/**
 * Brevo (formerly Sendinblue) provider adapter.
 * SDK is required lazily.
 */

function loadBrevo() {
  try {
    // eslint-disable-next-line global-require
    return require('@getbrevo/brevo');
  } catch (error) {
    const err = new Error("The '@getbrevo/brevo' package is not installed. Run: npm install @getbrevo/brevo");
    err.statusCode = 501;
    throw err;
  }
}

async function sendWithBrevo(config, message) {
  const Brevo = loadBrevo();
  const api = new Brevo.TransactionalEmailsApi();

  api.setApiKey(Brevo.TransactionalEmailsApiApiKeys.apiKey, config.brevoApiKey);

  const email = new Brevo.SendSmtpEmail();
  email.sender = { name: message.fromName || config.senderName, email: message.fromEmail || config.fromEmail };
  email.to = message.to.map(address => ({
    email: address,
    name: message.recipientName || address
  }));
  email.subject = message.subject;
  email.htmlContent = message.html;
  email.textContent = message.text;

  if (message.replyTo) email.replyTo = { email: message.replyTo };
  if (message.cc && message.cc.length) email.cc = message.cc.map(address => ({ email: address }));
  if (message.bcc && message.bcc.length) email.bcc = message.bcc.map(address => ({ email: address }));
  if (message.headers && Object.keys(message.headers).length) email.headers = message.headers;
  if (message.attachments && message.attachments.length) {
    email.attachment = message.attachments.map(a => {
      const item = { name: a.filename };
      if (a.href || a.path) item.url = a.href || a.path;
      if (a.content !== undefined) {
        item.content = Buffer.isBuffer(a.content) ? a.content.toString('base64') : a.content;
      }
      return item;
    });
  }

  try {
    const response = await api.sendTransacEmail(email);
    return {
      provider: 'brevo',
      messageId: (response && (response.messageId || (response.body && response.body.messageId))) || undefined,
      raw: response && response.body ? response.body : response
    };
  } catch (error) {
    const detail =
      (error.response && error.response.body && error.response.body.message) ||
      error.message ||
      'Brevo failed to send the email.';
    const err = new Error(detail);
    err.statusCode = 502;
    err.provider = 'brevo';
    throw err;
  }
}

/**
 * Validates the Brevo API key by fetching the account (no email is sent).
 * Lets /verify-connection confirm the key works before you try to send.
 */
async function verifyBrevoConnection(config) {
  const Brevo = loadBrevo();
  const api = new Brevo.AccountApi();
  api.setApiKey(Brevo.AccountApiApiKeys.apiKey, config.brevoApiKey);

  try {
    const res = await api.getAccount();
    const body = (res && res.body) || res || {};
    const company = body.companyName || (body.company && body.company.name) || undefined;
    return { ok: true, provider: 'brevo', email: body.email, company };
  } catch (error) {
    const detail =
      (error.response && error.response.body && error.response.body.message) ||
      error.message ||
      'Brevo rejected the API key.';
    return { ok: false, provider: 'brevo', error: detail };
  }
}

module.exports = { sendWithBrevo, verifyBrevoConnection };
