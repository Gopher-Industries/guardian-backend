'use strict';

/**
 * Normalises a value into a clean string array.
 * Handles three input formats:
 *   - Already an array        → returned as-is
 *   - Comma-separated string  → split, trimmed, empty entries removed
 *   - Undefined / null        → returns []
 *
 * @param {string|string[]|undefined} value
 * @returns {string[]}
 */
function parseStringArray(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  return value.split(',').map(s => s.trim()).filter(Boolean);
}

module.exports = { parseStringArray };
