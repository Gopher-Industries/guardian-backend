/**
 * Guardian Email Service — datetime.js
 *
 * Shared date/time formatting for email templates. Renders dates consistently
 * in the configured locale and timezone (defaults to en-AU / Australia/Perth)
 * so every template shows the same format regardless of the caller.
 *
 * Author: Graeme Thomas
 * Date:   2026-08-08
 */

/**
 * Formats a date/time for display inside an email.
 *
 * Accepts a Date, an ISO string, or a millisecond timestamp. If the value is
 * already a human string that cannot be parsed as a date (for example
 * "Tuesday morning"), it is returned unchanged so callers can pass either a
 * real date or pre-formatted text.
 *
 * @param {Date|string|number} value
 * @param {object} [options]
 * @param {string} [options.timeZone='Australia/Perth']
 * @param {string} [options.locale='en-AU']
 * @param {boolean} [options.dateOnly=false] Omit the time component.
 * @returns {string}
 */
function formatDateTime(value, options = {}) {
  const timeZone = options.timeZone || 'Australia/Perth';
  const locale = options.locale || 'en-AU';

  if (value === undefined || value === null || value === '') return '';

  const date = value instanceof Date ? value : new Date(value);

  // Not a real date (e.g. "next Tuesday") — return the original text.
  if (Number.isNaN(date.getTime())) return String(value);

  const fmtOptions = options.dateOnly
    ? { dateStyle: 'long' }
    : { dateStyle: 'long', timeStyle: 'short' };

  try {
    return new Intl.DateTimeFormat(locale, { timeZone, ...fmtOptions }).format(date);
  } catch (error) {
    // Unknown timezone/locale in this runtime — fall back to a safe default.
    return new Intl.DateTimeFormat('en-AU', fmtOptions).format(date);
  }
}

module.exports = { formatDateTime };
