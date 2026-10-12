'use strict';

/**
 * Guardian — PatientAccessGrant.
 *
 * One document = "user X may do Y to patient Z, authorised by W, until T".
 *
 * This is the scope half of the model. It is a sparse access-control list
 * rather than a dense user x patient matrix: only the pairs that are actually
 * authorised exist as rows, and each row carries its own lifecycle (who
 * granted it, why, when it expires, who revoked it).
 *
 * @author   Graeme Thomas
 * @module   guardian-access-control
 * @version  1.1.0
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;

const PatientAccessGrantSchema = new Schema(
  {
    /* ---------------- who ---------------- */
    subject: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },

    /* ---------------- what ---------------- */
    patient: {
      type: Schema.Types.ObjectId,
      ref: 'Patient',
      required: true,
      index: true
    },

    /**
     * Subset of the permission catalogue this grant conveys. The subject only
     * ever gets the intersection of this list with their role capabilities,
     * so a grant can never escalate someone above their role.
     */
    permissions: {
      type: [String],
      required: true,
      validate: {
        validator: (value) => Array.isArray(value) && value.length > 0,
        message: 'A grant must convey at least one permission'
      }
    },

    /* ---------------- lifecycle ---------------- */
    grantType: {
      type: String,
      enum: ['explicit', 'break-glass'],
      default: 'explicit',
      index: true
    },

    status: {
      type: String,
      enum: ['active', 'suspended', 'revoked'],
      default: 'active',
      index: true
    },

    validFrom: { type: Date, default: Date.now },
    /** null = open-ended. Break-glass grants are always bounded. */
    validUntil: { type: Date, default: null, index: true },

    /* ---------------- provenance ---------------- */
    grantedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    /** Snapshot of the grantor's role at issue time — survives later role changes. */
    grantedByRole: { type: String, default: '' },
    grantedAt: { type: Date, default: Date.now },

    /** Clinical or operational justification. Mandatory: this is a health record. */
    reason: { type: String, required: true, trim: true, maxlength: 500 },

    /** Free-text purpose-of-use tag, e.g. 'direct-care', 'audit', 'research'. */
    purpose: {
      type: String,
      enum: ['direct-care', 'care-coordination', 'audit', 'research', 'emergency', 'other'],
      default: 'direct-care'
    },

    /* ---------------- revocation ---------------- */
    revokedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    revokedAt: { type: Date, default: null },
    revocationReason: { type: String, default: '' },

    /** Optional org scoping so a multi-tenant deployment stays partitioned. */
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', default: null, index: true }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

/* The hot path: "all grants for this subject on this patient". */
PatientAccessGrantSchema.index({ subject: 1, patient: 1, status: 1 });
/* The list path: "every patient this subject can reach". */
PatientAccessGrantSchema.index({ subject: 1, status: 1, validUntil: 1 });
/* The console path: "who can see this patient?" */
PatientAccessGrantSchema.index({ patient: 1, status: 1 });

PatientAccessGrantSchema.virtual('isExpired').get(function isExpired() {
  return Boolean(this.validUntil && this.validUntil <= new Date());
});

PatientAccessGrantSchema.virtual('effectiveStatus').get(function effectiveStatus() {
  if (this.status !== 'active') return this.status;
  if (this.validUntil && this.validUntil <= new Date()) return 'expired';
  if (this.validFrom && this.validFrom > new Date()) return 'pending';
  return 'active';
});

PatientAccessGrantSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: (_doc, ret) => {
    ret.id = String(ret._id);
    return ret;
  }
});

module.exports =
  mongoose.models.PatientAccessGrant ||
  mongoose.model('PatientAccessGrant', PatientAccessGrantSchema);
