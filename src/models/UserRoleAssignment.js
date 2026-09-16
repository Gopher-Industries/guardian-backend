'use strict';

/**
 * Guardian — UserRoleAssignment.
 *
 * Multi-role membership, held in its own collection rather than as a field on
 * User. Two reasons:
 *
 *   1. Nothing in the existing codebase has to change. `User.role` stays exactly
 *      as it is, `verifyRole()` keeps working, and the resolver simply unions
 *      the primary role with whatever assignments exist. No migration is
 *      mandatory — an unmigrated database behaves exactly as it does today.
 *
 *   2. A role membership gets the same treatment a patient grant does:
 *      who assigned it, why, and when it lapses. "Priya covers as ward
 *      coordinator for the fortnight" is then a real, expiring record rather
 *      than a role change somebody has to remember to undo.
 *
 * @author   Graeme Thomas
 * @module   guardian-access-control
 * @version  1.1.0
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;

const UserRoleAssignmentSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    /** Lower-cased role name, matching Role.name and RolePermissionSet.roleName. */
    roleName: { type: String, required: true, lowercase: true, trim: true, index: true },

    /**
     * True for the row that mirrors User.role. Kept so the migration is
     * idempotent and so the console can show which role is the user's primary
     * without guessing.
     */
    isPrimary: { type: Boolean, default: false },

    status: { type: String, enum: ['active', 'revoked'], default: 'active', index: true },

    validFrom: { type: Date, default: Date.now },
    /** null = open-ended. Set it for locum and acting-up cover. */
    validUntil: { type: Date, default: null, index: true },

    assignedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    assignedAt: { type: Date, default: Date.now },
    reason: { type: String, default: '', trim: true, maxlength: 500 },

    revokedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    revokedAt: { type: Date, default: null },
    revocationReason: { type: String, default: '' }
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }, versionKey: false }
);

/* One live row per user+role. Partial index so revoked history can accumulate. */
UserRoleAssignmentSchema.index(
  { user: 1, roleName: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: 'active' } }
);
UserRoleAssignmentSchema.index({ roleName: 1, status: 1 });

UserRoleAssignmentSchema.virtual('effectiveStatus').get(function effectiveStatus() {
  if (this.status !== 'active') return this.status;
  const now = new Date();
  if (this.validUntil && this.validUntil <= now) return 'expired';
  if (this.validFrom && this.validFrom > now) return 'pending';
  return 'active';
});

UserRoleAssignmentSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: (_doc, ret) => {
    ret.id = String(ret._id);
    return ret;
  }
});

module.exports =
  mongoose.models.UserRoleAssignment ||
  mongoose.model('UserRoleAssignment', UserRoleAssignmentSchema);
