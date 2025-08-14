// Non-blocking logger
const AuditLog = require('../models/AuditLog');
const Alert = require('../models/Alert'); 

function sanitizeUA(ua) {
  if (!ua) return null;
  return String(ua).slice(0, 256);
}

function ipFromReq(req) {
  const raw = (req.headers['x-forwarded-for'] || req.ip || '').toString();
  const first = raw.split(',')[0].trim();
  return first || null;
}

function writeAsync(doc) {
  setImmediate(async () => {
    try {
      await AuditLog.create(doc);

      if (doc.severity === 'high' || doc.severity === 'critical') {
        await Alert.create({
          user_id: doc.actor || null,
          alert_type: 'audit_event',
          message: `[${doc.category}:${doc.action}] ${doc.meta?.reason || ''}`.trim(),
        });
      }
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('AuditLog write failed:', err.message);
      }
    }
  });
}

/**
 * Public API:
 * audit.log(req, {
 *   category: 'auth'|'authorization'|'task'|'patient'|'system',
 *   action: 'login_failed'|...,
 *   actor: ObjectId or null,
 *   targetModel: 'Task'|...,
 *   targetId: '...',
 *   severity: 'info'|'low'|'medium'|'high'|'critical',
 *   meta: { reason: '...', ... }  
 * });
 */
function log(req, payload) {
  const doc = {
    actor: payload.actor || null,
    category: payload.category,
    action: payload.action,
    targetModel: payload.targetModel || null,
    targetId: payload.targetId || null,
    severity: payload.severity || 'info',
    ip: payload.ip || ipFromReq(req),
    userAgent: payload.userAgent || sanitizeUA(req.headers['user-agent']),
    meta: payload.meta || {},
  };
  writeAsync(doc);
}

module.exports = { log };
