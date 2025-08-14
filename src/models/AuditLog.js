// Immutable audit trail for sensitive events. No TTL by design (permanent retention).
const mongoose = require('mongoose');

const AuditLogSchema = new mongoose.Schema(
  {
    // Actor may be null for unauthenticated events (e.g., failed login)
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true, default: null },

    // Coarse category for fast filtering
    category: {
      type: String,
      required: true,
      enum: ['auth', 'authorization', 'task', 'patient', 'system'],
      index: true,
    },

    // Specific event name (e.g., login_failed, permission_denied, task_updated)
    action: { type: String, required: true, index: true },

    // What object was acted on (optional)
    targetModel: { type: String, default: null, index: true },
    targetId: { type: String, default: null, index: true },

    // signal for triage and triggers
    severity: {
      type: String,
      enum: ['info', 'low', 'medium', 'high', 'critical'],
      default: 'info',
      index: true,
    },

    // Request context 
    ip: { type: String, default: null },
    userAgent: { type: String, default: null },

    // metadata 
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },

    createdAt: { type: Date, default: Date.now, index: true },
  },
  { versionKey: false }
);

// compound indexes
AuditLogSchema.index({ category: 1, createdAt: -1 });
AuditLogSchema.index({ action: 1, createdAt: -1 });
AuditLogSchema.index({ severity: 1, createdAt: -1 });

module.exports = mongoose.model('AuditLog', AuditLogSchema);
