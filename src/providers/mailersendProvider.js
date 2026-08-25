/**
 * Guardian Email Service — mailersendProvider.js
 *
 * MailerSend transport adapter. Keeps the backend's original MailerSend transport available behind the new provider interface.
 *
 * Author: Graeme Thomas
 * Date:   2026-08-08
 */

/**
 * MailerSend provider adapter.
 *
 * Guardian already depends on `mailersend`, so this keeps the existing
 * transport available while the Resend/Brevo options are rolled out.
 * Unlike the original utils/mailer.js this awaits the send and surfaces
 * failures instead of swallowing them into console.log.
 */

function loadMailerSend() {
  try {
    // eslint-disable-next-line global-require
    return require('mailersend');
  } catch (error) {
    const err = new Error("The 'mailersend' package is not installed. Run: npm install mailersend");
    err.statusCode = 501;
    throw err;
  }
}

function toBase64(content) {
  if (content === undefined || content === null) return '';
  return Buffer.isBuffer(content) ? content.toString('base64') : Buffer.from(String(content)).toString('base64');
}

async function sendWithMailerSend(config, message) {
  const { MailerSend, EmailParams, Sender, Recipient, Attachment } = loadMailerSend();

  const mailerSend = new MailerSend({ apiKey: config.mailersendApiKey });
  const sender = new Sender(message.fromEmail || config.fromEmail, message.fromName || config.senderName);

  const emailParams = new EmailParams()
    .setFrom(sender)
    .setTo(message.to.map(address => new Recipient(address, message.recipientName || address)))
    .setSubject(message.subject);

  if (message.html) emailParams.setHtml(message.html);
  if (message.text) emailParams.setText(message.text);
  if (message.replyTo) emailParams.setReplyTo(new Sender(message.replyTo, message.replyTo));
  if (message.cc && message.cc.length) {
    emailParams.setCc(message.cc.map(address => new Recipient(address, address)));
  }
  if (message.bcc && message.bcc.length) {
    emailParams.setBcc(message.bcc.map(address => new Recipient(address, address)));
  }
  if (message.attachments && message.attachments.length && typeof Attachment === 'function') {
    emailParams.setAttachments(
      message.attachments
        .filter(a => a.content !== undefined)
        .map(a => new Attachment(toBase64(a.content), a.filename, 'attachment'))
    );
  }

  try {
    const response = await mailerSend.email.send(emailParams);
    const headers = (response && response.headers) || {};

    return {
      provider: 'mailersend',
      messageId: headers['x-message-id'] || (response && response.body && response.body.message_id),
      raw: response && response.body ? response.body : undefined
    };
  } catch (error) {
    const detail =
      (error.body && (error.body.message || JSON.stringify(error.body))) ||
      error.message ||
      'MailerSend failed to send the email.';
    const err = new Error(detail);
    err.statusCode = 502;
    err.provider = 'mailersend';
    throw err;
  }
}

module.exports = { sendWithMailerSend };
