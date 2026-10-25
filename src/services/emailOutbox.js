/**
 * Guardian Email Service — emailOutbox.js
 *
 * Bounded in-memory record of recent send attempts (sent, dry-run, blocked, failed), newest first. Used by the outbox endpoints and the test console.
 *
 * Author: Graeme Thomas
 * Date:   2026-08-08
 */

/**
 * In-memory outbox.
 *
 * Records every send attempt (delivered, dry-run, blocked or failed) so the
 * test console and the automated tests can inspect what Guardian produced
 * without needing a real inbox. Bounded ring buffer — nothing is persisted.
 */

const MAX_ENTRIES = Number(process.env.EMAIL_OUTBOX_SIZE || 100);

const entries = [];

function record(entry) {
  entries.unshift(entry);
  if (entries.length > MAX_ENTRIES) entries.length = MAX_ENTRIES;
  return entry;
}

/**
 * @param {object} [options]
 * @param {number} [options.limit]
 * @param {boolean} [options.includeBody] Include rendered html/text
 * @param {string}  [options.template]    Filter by template key
 */
function list(options = {}) {
  const limit = Math.min(Number(options.limit) || 25, MAX_ENTRIES);

  return entries
    .filter(entry => (options.template ? entry.template === options.template : true))
    .slice(0, limit)
    .map(entry => (options.includeBody ? entry : stripBody(entry)));
}

function get(id) {
  return entries.find(entry => entry.id === id) || null;
}

function stripBody(entry) {
  const { html, text, ...rest } = entry;
  return { ...rest, htmlLength: html ? html.length : 0, textLength: text ? text.length : 0 };
}

function clear() {
  entries.length = 0;
}

function size() {
  return entries.length;
}

module.exports = { record, list, get, clear, size, MAX_ENTRIES };
