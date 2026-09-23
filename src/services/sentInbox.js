/**
 * Guardian Email Service — sentInbox.js
 *
 * Persists every send to MongoDB and provides read-only queries for the
 * browsable "Sent" inbox (list, get, stats). All writes are best-effort and
 * never throw into the send path; all reads are guarded so the API can fall
 * back to the in-memory outbox when no database is connected.
 *
 * Author: Graeme Thomas
 * Date:   2026-08-08
 */

const mongoose = require('mongoose');
const SentEmail = require('../models/SentEmail');

function persistenceEnabled() {
  return String(process.env.EMAIL_INBOX_PERSIST || 'true').toLowerCase() !== 'false';
}

/** True when a Mongo connection is up and persistence is enabled. */
function available() {
  return persistenceEnabled() && mongoose.connection && mongoose.connection.readyState === 1;
}

/**
 * Writes one outbox entry to MongoDB. Best-effort: on any error (including no
 * connection) it resolves without throwing, so a database problem can never
 * break email sending.
 */
async function persist(entry) {
  if (!available() || !entry) return null;

  try {
    const doc = {
      ref: entry.id,
      sentAt: entry.createdAt ? new Date(entry.createdAt) : new Date(),
      template: entry.template,
      status: entry.status,
      provider: entry.provider,
      requestedProvider: entry.requestedProvider,
      to: entry.to || [],
      cc: entry.cc || [],
      bcc: entry.bcc || [],
      blockedRecipients: entry.blockedRecipients || [],
      from: entry.from,
      replyTo: entry.replyTo,
      subject: entry.subject,
      html: entry.html,
      text: entry.text,
      htmlLength: entry.html ? entry.html.length : 0,
      textLength: entry.text ? entry.text.length : 0,
      headers: entry.headers,
      attachments: entry.attachments || [],
      messageId: entry.messageId,
      durationMs: entry.durationMs,
      error: entry.error || null
    };

    // Upsert on ref so a retry cannot create duplicates.
    await SentEmail.updateOne({ ref: doc.ref }, { $set: doc }, { upsert: true });
    return doc.ref;
  } catch (error) {
    if (process.env.NODE_ENV !== 'test') {
      console.error(JSON.stringify({ event: 'sent_inbox_persist_failed', error: error.message }));
    }
    return null;
  }
}

const SUMMARY_PROJECTION = '-html -text';

/**
 * Lists persisted messages, newest first, with filtering and pagination.
 * @param {object} options { limit, page, status, template, to, q, includeBody }
 */
async function list(options = {}) {
  const limit = Math.min(Math.max(Number(options.limit) || 25, 1), 200);
  const page = Math.max(Number(options.page) || 1, 1);
  const skip = (page - 1) * limit;

  const query = {};
  if (options.status) query.status = options.status;
  if (options.template) query.template = options.template;
  if (options.to) query.to = options.to;
  if (options.q) {
    const rx = new RegExp(String(options.q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    query.$or = [{ subject: rx }, { to: rx }, { template: rx }, { from: rx }];
  }

  const projection = options.includeBody ? {} : SUMMARY_PROJECTION;

  const [total, docs] = await Promise.all([
    SentEmail.countDocuments(query),
    SentEmail.find(query, projection).sort({ sentAt: -1 }).skip(skip).limit(limit).lean()
  ]);

  return {
    source: 'db',
    total,
    page,
    pages: Math.max(Math.ceil(total / limit), 1),
    limit,
    entries: docs.map(normalise)
  };
}

/** One message including the rendered body. */
async function get(ref) {
  const doc = await SentEmail.findOne({ ref }).lean();
  return doc ? normalise(doc) : null;
}

/** Counts grouped by status, plus a total. */
async function stats() {
  const rows = await SentEmail.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]);
  const byStatus = rows.reduce((acc, r) => {
    acc[r._id || 'unknown'] = r.count;
    return acc;
  }, {});

  const total = Object.values(byStatus).reduce((a, b) => a + b, 0);
  return { source: 'db', total, byStatus };
}

/** Deletes every stored message. Returns the number removed. */
async function clear() {
  const result = await SentEmail.deleteMany({});
  return result.deletedCount || 0;
}

// Presents a Mongo document with the same shape the API used for the outbox.
function normalise(doc) {
  const { _id, __v, ref, sentAt, ...rest } = doc;
  return {
    id: ref,
    createdAt: sentAt instanceof Date ? sentAt.toISOString() : sentAt,
    ...rest
  };
}

module.exports = { available, persist, list, get, stats, clear };
