/**
 * Guardian Email Service — emailService.js
 *
 * Provider-independent email service. Applies the send safety rules (address validation, allowlist, dry-run) and records every attempt in the outbox before delegating to the configured provider.
 *
 * Author: Graeme Thomas
 * Date:   2026-08-08
 */

/**
 * Guardian email service.
 *
 * Provider-independent interface used by controllers and by any other part
 * of the backend that needs to send email:
 *
 *   const { sendTemplatedEmail } = require('../services/emailService');
 *   await sendTemplatedEmail('patient-alert', { to, patientName, alertType });
 *
 * Delivery safety rules applied on every send, in order:
 *   1. Recipient addresses must be syntactically valid.
 *   2. If the allowlist is enforced, non-matching recipients are blocked.
 *   3. If dry-run is on (env, per-call, or test mode), nothing is delivered.
 *   4. Otherwise the configured provider is called.
 *
 * Every attempt is recorded in the outbox regardless of outcome.
 */

const crypto = require('crypto');

const { getEmailConfig, validateEmailConfig } = require('../config/emailConfig');
const { resolveProvider, verifyProviderConnection } = require('../providers');
const { buildEmailTemplate, listTemplates, getTemplateSample } = require('../templates/emailTemplates');
const outbox = require('./emailOutbox');
const sentInbox = require('./sentInbox');

// Deliberately conservative; avoids adding a `validator` dependency.
const EMAIL_PATTERN = /^[^\s@,;<>]+@[^\s@,;<>]+\.[A-Za-z]{2,}$/;

function isValidEmail(value) {
  return typeof value === 'string' && EMAIL_PATTERN.test(value.trim());
}

function toAddressList(value) {
  if (!value) return [];
  const raw = Array.isArray(value) ? value : String(value).split(',');
  return raw.map(entry => String(entry).trim()).filter(Boolean);
}

function badRequest(message, extra = {}) {
  const error = new Error(message);
  error.statusCode = 400;
  Object.assign(error, extra);
  return error;
}

/**
 * Normalises and validates the optional attachments array.
 * Each attachment needs a filename and some content source (content / path).
 * Returns undefined when none are supplied.
 */
function normalizeAttachments(attachments) {
  if (attachments === undefined || attachments === null) return undefined;
  if (!Array.isArray(attachments)) {
    throw badRequest('attachments must be an array.');
  }

  return attachments.map((att, index) => {
    if (!att || typeof att !== 'object') {
      throw badRequest(`attachment ${index} must be an object.`);
    }
    if (!att.filename) {
      throw badRequest(`attachment ${index} is missing a filename.`);
    }
    if (att.content === undefined && att.path === undefined && att.href === undefined) {
      throw badRequest(`attachment "${att.filename}" needs content, path or href.`);
    }
    return {
      filename: att.filename,
      content: att.content,
      path: att.path,
      href: att.href,
      contentType: att.contentType,
      encoding: att.encoding,
      cid: att.cid
    };
  });
}

/**
 * Builds standard compliance / deliverability headers.
 * List-Unsubscribe improves inbox placement and is required the moment any
 * non-transactional mail is sent under the Australian Spam Act.
 */
function buildComplianceHeaders(config, templateName) {
  const headers = { 'X-Guardian-Template': String(templateName || 'raw') };

  const parts = [];
  if (config.unsubscribeUrl) parts.push(`<${config.unsubscribeUrl}>`);
  if (config.supportEmail) parts.push(`<mailto:${config.supportEmail}?subject=unsubscribe>`);

  if (parts.length) {
    headers['List-Unsubscribe'] = parts.join(', ');
    if (config.unsubscribeUrl) headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
  }

  return headers;
}

/**
 * A recipient passes when its full address or its domain appears in the allowlist.
 */
function isAllowlisted(address, allowlist) {
  const lower = String(address).toLowerCase();
  const domain = lower.split('@')[1] || '';

  return allowlist.some(entry => {
    if (entry.startsWith('@')) return domain === entry.slice(1);
    if (entry.includes('@')) return lower === entry;
    return domain === entry;
  });
}

function partitionRecipients(addresses, config) {
  if (!config.allowlistEnforced || config.allowlist.length === 0) {
    if (config.allowlistEnforced && config.allowlist.length === 0) {
      return { allowed: [], blocked: addresses };
    }
    return { allowed: addresses, blocked: [] };
  }

  return addresses.reduce(
    (acc, address) => {
      if (isAllowlisted(address, config.allowlist)) acc.allowed.push(address);
      else acc.blocked.push(address);
      return acc;
    },
    { allowed: [], blocked: [] }
  );
}

/**
 * Checks that the configured provider is reachable, without sending.
 * Only SMTP supports a real handshake; others report as unsupported.
 */
async function verifyConnection(options = {}) {
  return verifyProviderConnection(getEmailConfig(options));
}

/**
 * Renders a template without sending. Used by the preview endpoint.
 */
function renderTemplate(type, data = {}, options = {}) {
  const config = getEmailConfig(options);
  return buildEmailTemplate(type, data, config);
}

/**
 * Low-level send. Accepts a fully rendered message.
 *
 * @param {object} message  { to, subject, html, text, cc, bcc, replyTo, recipientName }
 * @param {object} options  { provider, dryRun, template }
 */
async function sendRawEmail(message, options = {}) {
  const config = getEmailConfig(options);
  const validation = validateEmailConfig(config);

  const to = toAddressList(message.to);
  const cc = toAddressList(message.cc);
  const bcc = toAddressList(message.bcc);

  if (to.length === 0) {
    throw badRequest('At least one recipient address is required.');
  }

  const invalid = [...to, ...cc, ...bcc].filter(address => !isValidEmail(address));
  if (invalid.length) {
    throw badRequest(`Invalid recipient address: ${invalid.join(', ')}.`, { fields: invalid });
  }

  // Optional per-request source (sender) override.
  const fromEmail = (message.from && String(message.from).trim()) || config.fromEmail;
  const fromName = (message.fromName && String(message.fromName).trim()) || config.senderName;
  if (message.from && !isValidEmail(fromEmail)) {
    throw badRequest(`Invalid source (from) address: ${fromEmail}.`);
  }
  const fromFormatted = `${fromName} <${fromEmail}>`;

  if (!message.subject) {
    throw badRequest('A subject is required.');
  }

  if (!message.html && !message.text) {
    throw badRequest('An email must contain html or text content.');
  }

  const attachments = normalizeAttachments(message.attachments);
  const headers = { ...buildComplianceHeaders(config, options.template), ...(message.headers || {}) };

  const { allowed, blocked } = partitionRecipients(to, config);

  const id = crypto.randomBytes(10).toString('hex');
  const startedAt = Date.now();

  // Records an attempt in the in-memory outbox and persists it to the
  // "Sent" inbox (best-effort; a no-op when no database is connected).
  const store = async (payload) => {
    const stored = outbox.record(payload);
    await sentInbox.persist(stored);
    return stored;
  };

  const base = {
    id,
    createdAt: new Date().toISOString(),
    template: options.template || 'raw',
    requestedProvider: config.provider,
    to,
    cc,
    bcc,
    subject: message.subject,
    html: message.html,
    text: message.text,
    from: fromFormatted,
    replyTo: message.replyTo || config.replyTo || null,
    headers,
    attachments: attachments
      ? attachments.map(a => ({ filename: a.filename, contentType: a.contentType || null }))
      : undefined,
    blockedRecipients: blocked
  };

  // Everything blocked by the allowlist: record and stop.
  if (allowed.length === 0 && blocked.length > 0) {
    const entry = await store({
      ...base,
      status: 'blocked',
      provider: 'none',
      messageId: null,
      durationMs: Date.now() - startedAt,
      error: `All recipients blocked by EMAIL_ALLOWLIST (${config.allowlist.join(', ') || 'empty'}).`
    });

    const error = new Error(entry.error);
    error.statusCode = 403;
    error.outboxId = id;
    error.blockedRecipients = blocked;
    throw error;
  }

  const useDryRun = config.dryRun || config.provider === 'dryrun';
  const providerName = useDryRun ? 'dryrun' : config.provider;

  if (!useDryRun && !validation.ok) {
    const entry = await store({
      ...base,
      status: 'failed',
      provider: config.provider,
      messageId: null,
      durationMs: Date.now() - startedAt,
      error: validation.errors.join(' ')
    });

    const error = new Error(`Email is not configured correctly: ${validation.errors.join(' ')}`);
    error.statusCode = 500;
    error.outboxId = entry.id;
    throw error;
  }

  const send = resolveProvider(providerName);

  try {
    const result = await send(config, {
      to: allowed,
      cc,
      bcc,
      recipientName: message.recipientName,
      from: fromFormatted,
      fromEmail,
      fromName,
      subject: message.subject,
      html: message.html,
      text: message.text,
      replyTo: message.replyTo || config.replyTo || undefined,
      headers,
      attachments,
      intendedProvider: config.provider
    });

    if (!result || typeof result !== 'object') {
      const err = new Error(`Provider "${providerName}" returned no result.`);
      err.statusCode = 502;
      throw err;
    }

    const entry = await store({
      ...base,
      to: allowed,
      status: useDryRun ? 'dry-run' : 'sent',
      provider: result.provider || providerName,
      messageId: result.messageId || null,
      durationMs: Date.now() - startedAt,
      error: null
    });

    if (config.environment !== 'test') {
      console.info(
        JSON.stringify({
          event: 'email_sent',
          outboxId: entry.id,
          provider: entry.provider,
          template: entry.template,
          status: entry.status,
          messageId: entry.messageId,
          recipients: allowed.length,
          blocked: blocked.length,
          durationMs: entry.durationMs
        })
      );
    }

    return {
      id: entry.id,
      status: entry.status,
      provider: entry.provider,
      messageId: entry.messageId,
      template: entry.template,
      to: allowed,
      blockedRecipients: blocked,
      subject: entry.subject,
      durationMs: entry.durationMs
    };
  } catch (error) {
    const entry = await store({
      ...base,
      to: allowed,
      status: 'failed',
      provider: providerName,
      messageId: null,
      durationMs: Date.now() - startedAt,
      error: error.message
    });

    if (config.environment !== 'test') {
      console.error(
        JSON.stringify({
          event: 'email_failed',
          outboxId: entry.id,
          provider: providerName,
          template: entry.template,
          durationMs: entry.durationMs,
          error: error.message
        })
      );
    }

    error.outboxId = entry.id;
    if (!error.statusCode) error.statusCode = 502;
    throw error;
  }
}

/**
 * Renders a template and sends it.
 *
 * @param {string} type    Template key, e.g. 'patient-alert'
 * @param {object} data    Template data. Must include `to`.
 * @param {object} options { provider, dryRun, replyTo }
 */
async function sendTemplatedEmail(type, data = {}, options = {}) {
  const config = getEmailConfig(options);
  const rendered = buildEmailTemplate(type, data, config);

  return sendRawEmail(
    {
      to: data.to,
      cc: data.cc,
      bcc: data.bcc,
      recipientName: data.name,
      from: data.from,
      fromName: data.fromName,
      replyTo: data.replyTo,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      attachments: data.attachments,
      headers: data.headers
    },
    { ...options, template: type }
  );
}

/**
 * Sends a templated email by "option", the simplest entry point:
 * pass a destination address and an email option (template key). Any template
 * fields you do not supply are filled from the template's sample values, so a
 * minimal { to, option } call always renders a valid message.
 *
 * @param {string} option  Template key, e.g. 'welcome', 'otp', 'patient-alert'
 * @param {string} to      Destination email address
 * @param {object} [data]  Optional field overrides (merged over the sample)
 * @param {object} [options] { provider, dryRun }
 */
async function sendByOption(option, to, data = {}, options = {}) {
  if (!option) throw badRequest('An email option (template key) is required.');
  if (!to) throw badRequest('A destination address (to) is required.');

  // getTemplateSample throws a 400 for an unknown option.
  const merged = { ...getTemplateSample(option), ...data, to };
  return sendTemplatedEmail(option, merged, options);
}

/**
 * Sends the same template to several recipients, one message each.
 * Returns per-recipient results rather than failing the whole batch.
 */
async function sendBulkTemplatedEmail(type, recipients = [], sharedData = {}, options = {}) {
  const list = Array.isArray(recipients) ? recipients : [recipients];

  if (list.length === 0) {
    throw badRequest('At least one recipient is required.');
  }

  const results = [];

  for (const recipient of list) {
    const data =
      typeof recipient === 'string'
        ? { ...sharedData, to: recipient }
        : { ...sharedData, ...recipient };

    try {
      // Sequential on purpose: keeps within provider rate limits.
      // eslint-disable-next-line no-await-in-loop
      const result = await sendTemplatedEmail(type, data, options);
      results.push({ to: data.to, ok: true, ...result });
    } catch (error) {
      results.push({ to: data.to, ok: false, error: error.message, outboxId: error.outboxId || null });
    }
  }

  return {
    template: type,
    total: results.length,
    succeeded: results.filter(r => r.ok).length,
    failed: results.filter(r => !r.ok).length,
    results
  };
}

/**
 * Sends the built-in smoke test to a single address.
 */
function sendTestEmail(to, options = {}) {
  return sendTemplatedEmail('render-check', { to, name: options.name || 'Tester' }, options);
}

module.exports = {
  isValidEmail,
  verifyConnection,
  renderTemplate,
  sendRawEmail,
  sendTemplatedEmail,
  sendByOption,
  sendBulkTemplatedEmail,
  sendTestEmail,
  listTemplates,
  getTemplateSample,
  outbox
};
