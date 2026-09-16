'use strict';

/**
 * Guardian — RolePermissionSet.
 *
 * The capability half of the model: "what kind of action may this role ever
 * perform". Stored separately from Role so the existing Role collection and
 * every existing verifyRole() call site keep working untouched.
 *
 * This IS a permissions matrix — roles down the side, permission codes across
 * the top. It just does not try to answer "which patient", which is the job of
 * PatientAccessGrant.
 *
 * @author   Graeme Thomas
 * @module   guardian-access-control
 * @version  1.1.0
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;

const RolePermissionSetSchema = new Schema(
  {
    /** Lower-cased role name, matching Role.name (admin, doctor, nurse, ...). */
    roleName: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true
    },

    /** Human label for the console. Falls back to roleName when blank. */
    displayName: { type: String, default: '', trim: true },

    /** Permission codes. '*' and 'prefix.*' wildcards are supported. */
    permissions: { type: [String], default: [] },

    /**
     * Roles this one inherits from, transitively. `senior-nurse` inheriting
     * `nurse` picks up everything nurse has and adds to it, so a change to the
     * nurse baseline propagates instead of being re-typed. Cycles are refused
     * at edit time and broken safely at read time.
     */
    inherits: { type: [String], default: [] },

    /**
     * Shipped roles. Protected from deletion and from having `unscoped`
     * toggled off, so nobody can lock themselves out of administration.
     */
    isSystem: { type: Boolean, default: false },

    /** When true, this role is not patient-scoped (system administrators). */
    unscoped: { type: Boolean, default: false },

    /** When true, holders of this role may issue/revoke grants. */
    canGrant: { type: Boolean, default: false },

    description: { type: String, default: '' },

    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null }
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }, versionKey: false }
);

RolePermissionSetSchema.set('toJSON', {
  transform: (_doc, ret) => {
    ret.id = String(ret._id);
    return ret;
  }
});

module.exports =
  mongoose.models.RolePermissionSet ||
  mongoose.model('RolePermissionSet', RolePermissionSetSchema);
