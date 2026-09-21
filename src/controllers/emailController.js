/**
 * Guardian Email Service — emailController.js
 *
 * Express handlers for the email API: config, connection verification, template catalogue, preview, send / send-raw / send-bulk, smoke test and outbox inspection.
 *
 * Author: Graeme Thomas
 * Date:   2026-08-08
 */

const {
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
} = require('../services/emailService');

const { getEmailConfig, describeEmailConfig } = require('../config/emailConfig');
const sentInbox = require('../services/sentInbox');

function fail(res, error) {
  const status = error.statusCode || 500;

  return res.status(status).json({
    message: status >= 500 ? 'Unable to process the email request.' : error.message,
    error: error.message,
    ...(error.fields ? { fields: error.fields } : {}),
    ...(error.outboxId ? { outboxId: error.outboxId } : {}),
    ...(error.blockedRecipients ? { blockedRecipients: error.blockedRecipients } : {})
  });
}

/** GET /api/v1/email/config */
function getConfig(req, res) {
  res.json(describeEmailConfig(getEmailConfig()));
}

/**
 * POST /api/v1/email/verify-connection
 * Body: { provider }
 * Opens a connection to the provider without sending anything.
 */
async function verify(req, res) {
  try {
    const { provider } = req.body || {};
    const result = await verifyConnection({ provider });
    return res.status(result.ok === false ? 502 : 200).json(result);
  } catch (error) {
    return fail(res, error);
  }
}

/** GET /api/v1/email/templates */
function getTemplates(req, res) {
  res.json({
    count: listTemplates().length,
    templates: listTemplates()
  });
}

/** GET /api/v1/email/templates/:type/sample */
function getSample(req, res) {
  try {
    res.json({ template: req.params.type, sample: getTemplateSample(req.params.type) });
  } catch (error) {
    fail(res, error);
  }
}

/**
 * POST /api/v1/email/preview
 * Body: { template, data, format }
 * Renders without sending. format=html returns the raw document for an iframe.
 */
function preview(req, res) {
  try {
    const { template, data = {}, format } = req.body || {};

    if (!template) {
      return res.status(400).json({ message: 'A template key is required.' });
    }

    const rendered = renderTemplate(template, { to: 'preview@example.com', ...data });

    if (format === 'html') {
      res.set('Content-Type', 'text/html; charset=utf-8');
      return res.send(rendered.html);
    }

    return res.json(rendered);
  } catch (error) {
    return fail(res, error);
  }
}


/**
 * POST /api/v1/email/send-option
 * The simplest send: pass a destination address and an email option (template
 * key). Missing template fields are filled from the option's sample data.
 * Body: { to, option, data?, provider?, dryRun? }
 */
async function sendOption(req, res) {
  try {
    const { to, option, template, data = {}, provider, dryRun } = req.body || {};
    const opt = option || template;
    if (!opt) return res.status(400).json({ message: 'An email option (template key) is required.' });
    if (!to) return res.status(400).json({ message: 'A destination address (to) is required.' });

    const result = await sendByOption(opt, to, data, { provider, dryRun });
    return res.status(202).json({ message: 'Email accepted for delivery.', ...result });
  } catch (error) {
    return fail(res, error);
  }
}

/**
 * POST /api/v1/email/send
 * Body: { template, data, provider, dryRun }
 */
async function send(req, res) {
  try {
    const { template, data = {}, provider, dryRun } = req.body || {};

    if (!template) {
      return res.status(400).json({ message: 'A template key is required.' });
    }

    const result = await sendTemplatedEmail(template, data, { provider, dryRun });
    return res.status(202).json({ message: 'Email accepted for delivery.', ...result });
  } catch (error) {
    return fail(res, error);
  }
}

/**
 * POST /api/v1/email/send-raw
 * Body: { to, subject, html, text, cc, bcc, replyTo, provider, dryRun }
 */
async function sendRaw(req, res) {
  try {
    const { provider, dryRun, ...message } = req.body || {};
    const result = await sendRawEmail(message, { provider, dryRun });
    return res.status(202).json({ message: 'Email accepted for delivery.', ...result });
  } catch (error) {
    return fail(res, error);
  }
}

/**
 * POST /api/v1/email/send-bulk
 * Body: { template, recipients: [...], data, provider, dryRun }
 */
async function sendBulk(req, res) {
  try {
    const { template, recipients = [], data = {}, provider, dryRun } = req.body || {};

    if (!template) {
      return res.status(400).json({ message: 'A template key is required.' });
    }

    const result = await sendBulkTemplatedEmail(template, recipients, data, { provider, dryRun });
    return res.status(202).json(result);
  } catch (error) {
    return fail(res, error);
  }
}

/**
 * POST /api/v1/email/test
 * Body: { to, provider, dryRun }
 * Sends the render-check smoke test.
 */
async function sendSmokeTest(req, res) {
  try {
    const { to, provider, dryRun, name } = req.body || {};

    if (!to) {
      return res.status(400).json({ message: 'A recipient address ("to") is required.' });
    }

    const result = await sendTestEmail(to, { provider, dryRun, name });
    return res.status(202).json({ message: 'Test email accepted.', ...result });
  } catch (error) {
    return fail(res, error);
  }
}

/** GET /api/v1/email/outbox */
function getOutbox(req, res) {
  const { limit, template, includeBody } = req.query;

  res.json({
    size: outbox.size(),
    capacity: outbox.MAX_ENTRIES,
    entries: outbox.list({
      limit,
      template,
      includeBody: String(includeBody) === 'true'
    })
  });
}

/** GET /api/v1/email/outbox/:id */
function getOutboxEntry(req, res) {
  const entry = outbox.get(req.params.id);
  if (!entry) return res.status(404).json({ message: 'Outbox entry not found.' });
  return res.json(entry);
}

/** GET /api/v1/email/outbox/:id/html */
function getOutboxEntryHtml(req, res) {
  const entry = outbox.get(req.params.id);
  if (!entry) return res.status(404).send('Outbox entry not found.');
  res.set('Content-Type', 'text/html; charset=utf-8');
  return res.send(entry.html || '<p>No HTML body.</p>');
}

/** DELETE /api/v1/email/outbox */
function clearOutbox(req, res) {
  outbox.clear();
  res.json({ message: 'Outbox cleared.' });
}



/* ------------------------------------------------------------------ */
/* Persisted "Sent" inbox (MongoDB, with in-memory fallback)           */
/* ------------------------------------------------------------------ */

// Builds a list response from the in-memory outbox when no database is
// connected, so the inbox endpoints still work in a DB-less dev setup.
function inboxFromMemory(query) {
  const { status, template, to, q, limit, page } = query;
  let entries = outbox.list({ template, limit: outbox.MAX_ENTRIES, includeBody: false });

  if (status) entries = entries.filter(e => e.status === status);
  if (to) entries = entries.filter(e => (e.to || []).includes(to));
  if (q) {
    const rx = new RegExp(String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    entries = entries.filter(e => rx.test(e.subject || '') || (e.to || []).some(t => rx.test(t)) || rx.test(e.template || ''));
  }

  const lim = Math.min(Math.max(Number(limit) || 25, 1), 200);
  const pg = Math.max(Number(page) || 1, 1);
  const total = entries.length;
  const paged = entries.slice((pg - 1) * lim, (pg - 1) * lim + lim);

  return { source: 'memory', total, page: pg, pages: Math.max(Math.ceil(total / lim), 1), limit: lim, entries: paged };
}

/** GET /api/v1/email/inbox */
async function getInbox(req, res) {
  try {
    const { status, template, to, q, limit, page, includeBody } = req.query;
    const opts = { status, template, to, q, limit, page, includeBody: String(includeBody) === 'true' };

    const result = sentInbox.available()
      ? await sentInbox.list(opts)
      : inboxFromMemory(opts);

    return res.json(result);
  } catch (error) {
    return fail(res, error);
  }
}

/** GET /api/v1/email/inbox/stats */
async function getInboxStats(req, res) {
  try {
    if (sentInbox.available()) {
      return res.json(await sentInbox.stats());
    }
    const entries = outbox.list({ limit: outbox.MAX_ENTRIES });
    const byStatus = entries.reduce((acc, e) => { acc[e.status] = (acc[e.status] || 0) + 1; return acc; }, {});
    return res.json({ source: 'memory', total: entries.length, byStatus });
  } catch (error) {
    return fail(res, error);
  }
}

/** GET /api/v1/email/inbox/:id */
async function getInboxEntry(req, res) {
  try {
    const entry = sentInbox.available()
      ? (await sentInbox.get(req.params.id)) || outbox.get(req.params.id)
      : outbox.get(req.params.id);

    if (!entry) return res.status(404).json({ message: 'Message not found.' });
    return res.json(entry);
  } catch (error) {
    return fail(res, error);
  }
}

/** GET /api/v1/email/inbox/:id/html */
async function getInboxEntryHtml(req, res) {
  try {
    const entry = sentInbox.available()
      ? (await sentInbox.get(req.params.id)) || outbox.get(req.params.id)
      : outbox.get(req.params.id);

    if (!entry) return res.status(404).send('Message not found.');
    res.set('Content-Type', 'text/html; charset=utf-8');
    return res.send(entry.html || '<p>No HTML body.</p>');
  } catch (error) {
    return fail(res, error);
  }
}

/** DELETE /api/v1/email/inbox */
async function clearInbox(req, res) {
  try {
    let removed = 0;
    if (sentInbox.available()) removed = await sentInbox.clear();
    outbox.clear();
    return res.json({ message: 'Sent inbox cleared.', removed, persisted: sentInbox.available() });
  } catch (error) {
    return fail(res, error);
  }
}

/** GET /api/v1/email/inbox-view — browsable read-only page */
function inboxView(req, res) {
  const config = getEmailConfig();
  if (!config.inboxEnabled) {
    return res.status(404).json({ message: 'The sent inbox view is disabled. Set EMAIL_INBOX_ENABLED=true to enable it.' });
  }
  return res.render('email-inbox', { apiBase: '/api/v1/email' }, (error, html) => {
    if (error) {
      return res.status(500).json({ message: 'Unable to render the sent inbox.', error: error.message });
    }
    return res.send(html);
  });
}


module.exports = {
  getConfig,
  sendOption,
  getInbox,
  getInboxStats,
  getInboxEntry,
  getInboxEntryHtml,
  clearInbox,
  inboxView,
  verify,
  getTemplates,
  getSample,
  preview,
  send,
  sendRaw,
  sendBulk,
  sendSmokeTest,
  getOutbox,
  getOutboxEntry,
  getOutboxEntryHtml,
  clearOutbox
};
