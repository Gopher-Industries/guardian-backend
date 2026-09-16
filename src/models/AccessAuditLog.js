'use strict';

/**
 * Guardian — AccessAuditLog.
 *
 * Append-only. Every evaluated access decision lands here: allows as well as
 * denies. In a health context the audit trail is not optional extra credit —
 * "who looked at this patient, when, and under what authority" is the thing a
 * regulator or a patient will actually ask for.
 *
 * Grant administration events (issue / revoke / matrix change) are logged with
 * the same shape so one query answers both questions.
 *
 * @author   Graeme Thomas
 * @module   guardian-access-control
 * @version  1.1.0
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;

const AccessAuditLogSchema = new Schema(
  {
    event: {
      type: String,
      enum: [
        'access.decision',
        'grant.issued',
        'grant.revoked',
        'grant.updated',
        'breakglass.invoked',
        'matrix.updated',
        'role.created',
        'role.updated',
        'role.deleted',
        'role.assigned',
        'role.unassigned'
      ],
      required: true,
      index: true
    },

    subject: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    /** Comma-joined effective role names at decision time. */
    subjectRole: { type: String, default: '' },
    patient: { type: Schema.Types.ObjectId, ref: 'Patient', default: null, index: true },

    permission: { type: String, default: '' },
    allowed: { type: Boolean, default: null, index: true },
    /** Machine-readable reason code from policy.REASONS. */
    reason: { type: String, default: '' },

    grant: { type: Schema.Types.ObjectId, ref: 'PatientAccessGrant', default: null },

    /** Who performed the administrative action (grant.issued etc.). */
    actor: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },

    method: { type: String, default: '' },
    path: { type: String, default: '' },
    ip: { type: String, default: '' },
    userAgent: { type: String, default: '' },

    /** Anything else worth keeping — kept small on purpose. */
    detail: { type: Schema.Types.Mixed, default: null },

    at: { type: Date, default: Date.now, index: true }
  },
  { versionKey: false }
);

AccessAuditLogSchema.index({ at: -1 });
AccessAuditLogSchema.index({ patient: 1, at: -1 });
AccessAuditLogSchema.index({ subject: 1, at: -1 });
AccessAuditLogSchema.index({ allowed: 1, at: -1 });

AccessAuditLogSchema.set('toJSON', {
  versionKey: false,
  transform: (_doc, ret) => {
    ret.id = String(ret._id);
    return ret;
  }
});

module.exports =
  mongoose.models.AccessAuditLog || mongoose.model('AccessAuditLog', AccessAuditLogSchema);
