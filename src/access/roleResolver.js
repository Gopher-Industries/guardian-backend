'use strict';

/**
 * Guardian — role resolver.
 *
 * Pure, like policy.js: hand it a matrix and a list of role names, get back the
 * effective capability set. No mongoose, no express.
 *
 * Two jobs:
 *
 *   1. INHERITANCE — a role may list `inherits: ['nurse']` and pick up
 *      everything nurse has, transitively. Cycles are detected and broken
 *      rather than thrown, because a bad matrix row must never take the API
 *      down; the cycle is reported so the console can show it.
 *
 *   2. MULTI-ROLE UNION — a user may hold several roles. The effective
 *      capability set is the union of all of them. `unscoped` and `canGrant`
 *      are true if ANY held role sets them.
 *
 * Union semantics are deliberate and worth stating: adding a role can only ever
 * widen a user's capabilities, never narrow them. There is no deny rule and no
 * "most restrictive wins". If you need a user to lose something, take the role
 * away — do not add a restrictive one and expect it to subtract.
 *
 * @author   Graeme Thomas
 * @module   guardian-access-control
 * @version  1.1.0
 */

const { normalisePermission } = require('./permissions');

const MAX_DEPTH = 16;

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function normaliseRoleName(value) {
  return String(value || '').trim().toLowerCase();
}

/**
 * Expand one role, following `inherits` transitively.
 *
 * @returns {{permissions:string[], unscoped:boolean, canGrant:boolean,
 *            chain:string[], cycles:string[], missing:string[]}}
 */
function expandRole(roleName, matrix, options = {}) {
  const permissions = new Set();
  const chain = [];
  const cycles = [];
  const missing = [];
  let unscoped = false;
  let canGrant = false;

  const visiting = new Set();

  function walk(name, depth) {
    const key = normaliseRoleName(name);
    if (!key) return;

    if (visiting.has(key)) {
      if (!cycles.includes(key)) cycles.push(key);
      return;
    }
    if (depth > MAX_DEPTH) {
      if (!cycles.includes(key)) cycles.push(key);
      return;
    }

    const entry = matrix[key];
    if (!entry) {
      if (!missing.includes(key)) missing.push(key);
      return;
    }

    visiting.add(key);
    if (!chain.includes(key)) chain.push(key);

    (entry.permissions || []).map(normalisePermission).filter(Boolean).forEach((code) => permissions.add(code));
    if (entry.unscoped) unscoped = true;
    if (entry.canGrant) canGrant = true;

    asArray(entry.inherits).forEach((parent) => walk(parent, depth + 1));

    visiting.delete(key);
  }

  walk(roleName, 0);

  return {
    permissions: [...permissions],
    unscoped,
    canGrant,
    chain,
    cycles,
    missing,
    ...(options.includeRoleName ? { roleName: normaliseRoleName(roleName) } : {})
  };
}

/**
 * Resolve the effective capability set for a user holding several roles.
 *
 * @param {string[]} roleNames
 * @param {object}   matrix   roleName -> { permissions, inherits, unscoped, canGrant }
 * @returns {{roleNames:string[], capabilities:string[], unscoped:boolean,
 *            canGrant:boolean, resolvedFrom:object, cycles:string[], missing:string[]}}
 */
function resolveRoles(roleNames, matrix) {
  const held = [...new Set(asArray(roleNames).map(normaliseRoleName).filter(Boolean))];

  const capabilities = new Set();
  const resolvedFrom = {};
  const cycles = new Set();
  const missing = new Set();
  let unscoped = false;
  let canGrant = false;

  held.forEach((roleName) => {
    const expanded = expandRole(roleName, matrix);
    expanded.permissions.forEach((code) => capabilities.add(code));
    if (expanded.unscoped) unscoped = true;
    if (expanded.canGrant) canGrant = true;
    expanded.cycles.forEach((value) => cycles.add(value));
    expanded.missing.forEach((value) => missing.add(value));
    resolvedFrom[roleName] = expanded.chain;
  });

  return {
    roleNames: held,
    capabilities: [...capabilities],
    unscoped,
    canGrant,
    resolvedFrom,
    cycles: [...cycles],
    missing: [...missing]
  };
}

/**
 * Would adding `parent` to `child.inherits` create a cycle?
 * Used to refuse the edit up front rather than discover it at request time.
 */
function wouldCreateCycle(childRole, parentRole, matrix) {
  const child = normaliseRoleName(childRole);
  const parent = normaliseRoleName(parentRole);
  if (!child || !parent) return false;
  if (child === parent) return true;

  const probe = Object.assign({}, matrix, {
    [child]: Object.assign({}, matrix[child] || { permissions: [] }, {
      inherits: [...asArray((matrix[child] || {}).inherits), parent]
    })
  });

  return expandRole(child, probe).cycles.length > 0;
}

/**
 * Roles that inherit from `roleName`, directly or transitively. The question to
 * ask before deleting or narrowing a role.
 */
function descendantsOf(roleName, matrix) {
  const target = normaliseRoleName(roleName);
  return Object.keys(matrix).filter(
    (candidate) => candidate !== target && expandRole(candidate, matrix).chain.includes(target)
  );
}

module.exports = {
  MAX_DEPTH,
  normaliseRoleName,
  expandRole,
  resolveRoles,
  wouldCreateCycle,
  descendantsOf
};
