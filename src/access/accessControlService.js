'use strict';

/**
 * Guardian — access-control service.
 *
 * The one place the rest of the application talks to. It:
 *   - loads the subject, the patient and the relevant grants,
 *   - hands them to the pure policy engine,
 *   - writes the decision to the audit log,
 *   - and administers grants (issue / revoke / break-glass).
 *
 * Nothing here reaches into express or mongoose directly, so the same service
 * runs against the in-memory repository in tests.
 *
 * @author   Graeme Thomas
 * @module   guardian-access-control
 * @version  1.1.0
 */

const policy = require('./policy');
const { PERMISSIONS, isKnownPermission, normalisePermission, buildCapabilityMatcher } = require('./permissions');
const { resolveRoles, normaliseRoleName, expandRole } = require('./roleResolver');

const DEFAULT_SERVICE_OPTIONS = {
  allowRelationshipAccess: process.env.ACCESS_ALLOW_RELATIONSHIP !== 'false',
  maskUnknownPatient: process.env.ACCESS_MASK_UNKNOWN_PATIENT !== 'false',
  auditAllows: process.env.ACCESS_AUDIT_ALLOWS !== 'false',
  auditDenies: true,
  /** Break-glass grants may never exceed this many minutes. */
  breakGlassMaxMinutes: Number(process.env.ACCESS_BREAKGLASS_MINUTES || 60)
};

class AccessError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code || 'ACCESS_ERROR';
  }
}

/**
 * Parse a caller-supplied date. Unlike the policy engine — which treats an
 * unparseable date as "no bound" so a bad record can never harden into a
 * denial — input validation must reject it outright. A grant whose validUntil
 * failed to parse would otherwise never expire.
 */
function parseDate(value, label) {
  if (value === undefined || value === null || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new AccessError(400, `${label} is not a valid date`, 'INVALID_DATE');
  }
  return date;
}

function createAccessControlService({ repository, options } = {}) {
  if (!repository) throw new Error('createAccessControlService requires a repository');
  const settings = Object.assign({}, DEFAULT_SERVICE_OPTIONS, options || {});

  async function policyOptions() {
    const matrix = await repository.getRoleMatrix();
    const unscopedRoles = Object.values(matrix)
      .filter((entry) => entry.unscoped)
      .map((entry) => entry.roleName);

    return {
      unscopedRoles: unscopedRoles.length ? unscopedRoles : ['admin'],
      allowRelationshipAccess: settings.allowRelationshipAccess,
      maskUnknownPatient: settings.maskUnknownPatient
    };
  }

  /* ------------------------------------------------------------------ *
   * Decision path
   * ------------------------------------------------------------------ */

  /**
   * Decide whether `userId` may perform `permission` on `patientId`.
   * Always returns a decision object; never throws for a plain denial.
   */
  async function check({ userId, patientId, permission, context = {}, audit = true }) {
    const opts = await policyOptions();
    const subject = await repository.getSubject(userId);

    let patient = null;
    let grants = [];

    if (subject && patientId) {
      patient = await repository.getPatient(patientId);

      // Only look for grants once the patient has actually resolved. Grants are
      // keyed to a real patient, so there is nothing to find otherwise, and it
      // keeps a malformed identifier away from the query layer entirely.
      if (patient) {
        grants = await repository.getGrants({ subjectId: subject.id, patientId: patient.id });
      }
    }

    const decision = policy.evaluate({
      subject: subject
        ? {
            id: subject.id,
            roleName: subject.roleName,
            roleNames: subject.roleNames || [subject.roleName],
            status: subject.status,
            capabilities: subject.capabilities
          }
        : null,
      patient,
      permission,
      grants,
      options: opts
    });

    const shouldAudit =
      audit && ((decision.allowed && settings.auditAllows) || (!decision.allowed && settings.auditDenies));

    if (shouldAudit) {
      await repository.writeAudit({
        event: 'access.decision',
        subject: subject ? subject.id : null,
        subjectRole: subject ? (subject.roleNames || [subject.roleName]).join(',') : '',
        patient: patient ? patient.id : null,
        permission: normalisePermission(permission),
        allowed: decision.allowed,
        reason: decision.reason,
        grant: decision.grantId || null,
        method: context.method || '',
        path: context.path || '',
        ip: context.ip || '',
        userAgent: context.userAgent || '',
        detail: decision.relationship ? { relationship: decision.relationship } : null
      });
    }

    return { ...decision, subject, patient };
  }

  /**
   * Every patient id this user may reach with `permission`.
   * Use to scope list endpoints — never filter in the client.
   */
  async function authorisedPatientIds({ userId, permission }) {
    const opts = await policyOptions();
    const subject = await repository.getSubject(userId);
    if (!subject) return [];

    const [grants, relatedPatientIds, allPatientIds] = await Promise.all([
      repository.getGrants({ subjectId: subject.id }),
      opts.allowRelationshipAccess ? repository.getRelatedPatientIds(subject.id) : Promise.resolve([]),
      subject.unscoped ? repository.getAllPatientIds() : Promise.resolve([])
    ]);

    return policy.filterAuthorisedPatientIds({
      subject: {
        id: subject.id,
        roleName: subject.roleName,
        roleNames: subject.roleNames || [subject.roleName],
        status: subject.status,
        capabilities: subject.capabilities
      },
      permission,
      grants,
      relatedPatientIds,
      allPatientIds,
      options: opts
    });
  }

  /* ------------------------------------------------------------------ *
   * Administration
   * ------------------------------------------------------------------ */

  async function assertCanGrant(actorId) {
    const actor = await repository.getSubject(actorId);
    if (!actor) throw new AccessError(401, 'Authenticated user could not be resolved', 'SUBJECT_UNKNOWN');

    const status = String(actor.status || '').toLowerCase();
    if (status !== 'approved' && status !== 'active') {
      throw new AccessError(403, 'Your account is not active', 'SUBJECT_INACTIVE');
    }

    const holdsCapability = buildCapabilityMatcher(actor.capabilities)('access.grant:manage');

    if (!holdsCapability || !actor.canGrant) {
      throw new AccessError(403, 'Only a doctor or administrator may administer patient access', 'NOT_A_GRANTOR');
    }

    return actor;
  }

  /**
   * A doctor may only authorise access to patients they are themselves
   * responsible for. An administrator may authorise access to any patient.
   */
  async function assertGrantorOwnsPatient(actor, patient) {
    if (actor.unscoped) return;

    const related = await repository.getRelatedPatientIds(actor.id);
    if (related.includes(patient.id)) return;

    const own = await repository.getGrants({ subjectId: actor.id, patientId: patient.id });
    const usable = own.some((grant) => policy.classifyGrant(grant, 'patient:read', new Date()).rank === 0);
    if (usable) return;

    throw new AccessError(
      403,
      'You may only authorise access to patients under your own care',
      'GRANTOR_NOT_RESPONSIBLE'
    );
  }

  function validatePermissions(list) {
    const requested = (Array.isArray(list) ? list : [list]).map(normalisePermission).filter(Boolean);
    if (!requested.length) throw new AccessError(400, 'At least one permission is required', 'NO_PERMISSIONS');

    const unknown = requested.filter((code) => !isKnownPermission(code));
    if (unknown.length) {
      throw new AccessError(400, `Unknown permission(s): ${unknown.join(', ')}`, 'UNKNOWN_PERMISSION');
    }
    return requested;
  }

  /**
   * Issue a grant. The conveyed permissions are intersected with the
   * *recipient's* role capabilities, so a grant can never escalate anyone
   * above the ceiling their role sets.
   */
  async function issueGrant({ actorId, subjectId, patientId, permissions, reason, purpose, validFrom, validUntil, context = {} }) {
    const actor = await assertCanGrant(actorId);

    if (!reason || !String(reason).trim()) {
      throw new AccessError(400, 'A reason is required for every access grant', 'REASON_REQUIRED');
    }

    const recipient = await repository.getSubject(subjectId);
    if (!recipient) throw new AccessError(404, 'Recipient user not found', 'RECIPIENT_NOT_FOUND');

    const patient = await repository.getPatient(patientId);
    if (!patient) throw new AccessError(404, 'Patient not found', 'PATIENT_NOT_FOUND');

    await assertGrantorOwnsPatient(actor, patient);

    const from = parseDate(validFrom, 'validFrom');
    const until = parseDate(validUntil, 'validUntil');
    const startsAt = from || new Date();

    // Order matters: report "already expired" before "out of range", because
    // when validFrom is omitted it defaults to now and every past validUntil
    // would otherwise be reported as a range error, which is true but useless.
    if (until && until <= new Date()) {
      throw new AccessError(400, 'validUntil is already in the past, so this grant would convey nothing', 'GRANT_ALREADY_EXPIRED');
    }
    if (until && until <= startsAt) {
      throw new AccessError(400, 'validUntil must be after validFrom', 'INVALID_DATE_RANGE');
    }

    const requested = validatePermissions(permissions);
    const ceiling = require('./permissions').buildCapabilityMatcher(recipient.capabilities);
    const effective = requested.filter((code) => ceiling(code));

    if (!effective.length) {
      throw new AccessError(
        422,
        `The '${recipient.roleName || 'unknown'}' role does not carry any of the requested permissions, so this grant would convey nothing`,
        'PERMISSIONS_EXCEED_ROLE'
      );
    }

    const grant = await repository.createGrant({
      subject: recipient.id,
      patient: patient.id,
      permissions: effective,
      grantType: 'explicit',
      status: 'active',
      validFrom: startsAt,
      validUntil: until,
      grantedBy: actor.id,
      grantedByRole: actor.roleName,
      grantedAt: new Date(),
      reason: String(reason).trim(),
      purpose: purpose || 'direct-care',
      organization: recipient.organization || patient.organization || null
    });

    await repository.writeAudit({
      event: 'grant.issued',
      actor: actor.id,
      subject: recipient.id,
      subjectRole: recipient.roleName,
      patient: patient.id,
      permission: effective.join(','),
      allowed: true,
      reason: 'GRANT_ISSUED',
      grant: grant.id,
      method: context.method || '',
      path: context.path || '',
      ip: context.ip || '',
      detail: {
        requested,
        granted: effective,
        droppedByRoleCeiling: requested.filter((code) => !effective.includes(code)),
        justification: String(reason).trim(),
        validUntil: grant.validUntil
      }
    });

    return { grant, droppedByRoleCeiling: requested.filter((code) => !effective.includes(code)) };
  }

  async function revokeGrant({ actorId, grantId, reason, context = {} }) {
    const actor = await assertCanGrant(actorId);

    const grant = await repository.findGrantById(grantId);
    if (!grant) throw new AccessError(404, 'Grant not found', 'GRANT_NOT_FOUND');
    if (grant.status === 'revoked') return { grant, alreadyRevoked: true };

    const patient = await repository.getPatient(grant.patient);
    if (patient) await assertGrantorOwnsPatient(actor, patient);

    const updated = await repository.updateGrant(grant.id, {
      status: 'revoked',
      revokedBy: actor.id,
      revokedAt: new Date(),
      revocationReason: String(reason || '').trim()
    });

    await repository.writeAudit({
      event: 'grant.revoked',
      actor: actor.id,
      subject: grant.subject,
      patient: grant.patient,
      permission: (grant.permissions || []).join(','),
      allowed: true,
      reason: 'GRANT_REVOKED',
      grant: grant.id,
      method: context.method || '',
      path: context.path || '',
      ip: context.ip || '',
      detail: { revocationReason: String(reason || '').trim() }
    });

    return { grant: updated, alreadyRevoked: false };
  }

  /**
   * Emergency access. Self-service, immediate, always time-boxed, and loudly
   * audited — the clinical safety valve that stops people sharing logins when
   * the paperwork has not caught up.
   */
  async function invokeBreakGlass({ actorId, patientId, permissions, reason, minutes, context = {} }) {
    const actor = await repository.getSubject(actorId);
    if (!actor) throw new AccessError(401, 'Authenticated user could not be resolved', 'SUBJECT_UNKNOWN');

    // A suspended account must not be able to take emergency access. The normal
    // read path checks this in the policy engine, but break-glass writes its own
    // grant and so has to check for itself.
    const actorStatus = String(actor.status || '').toLowerCase();
    if (actorStatus !== 'approved' && actorStatus !== 'active') {
      throw new AccessError(403, 'Your account is not active', 'SUBJECT_INACTIVE');
    }

    const canUse = require('./permissions').buildCapabilityMatcher(actor.capabilities)('access.breakglass:use');
    if (!canUse) throw new AccessError(403, 'Your role may not invoke break-glass access', 'BREAKGLASS_FORBIDDEN');

    if (!reason || String(reason).trim().length < 10) {
      throw new AccessError(400, 'Break-glass access requires a written clinical justification (10 characters minimum)', 'REASON_REQUIRED');
    }

    const patient = await repository.getPatient(patientId);
    if (!patient) throw new AccessError(404, 'Patient not found', 'PATIENT_NOT_FOUND');

    const requested = validatePermissions(permissions && permissions.length ? permissions : ['patient:read']);
    const ceiling = require('./permissions').buildCapabilityMatcher(actor.capabilities);
    const effective = requested.filter((code) => ceiling(code));
    if (!effective.length) throw new AccessError(422, 'Your role carries none of the requested permissions', 'PERMISSIONS_EXCEED_ROLE');

    // Clamp hard. A negative `minutes` would otherwise produce a window that
    // closed before it opened, and a non-numeric one an Invalid Date.
    const configuredCeiling = Number(settings.breakGlassMaxMinutes);
    const maxMinutes = Number.isFinite(configuredCeiling) && configuredCeiling > 0 ? configuredCeiling : 60;
    const requestedMinutes = Number(minutes);
    const windowMinutes = Math.min(
      Number.isFinite(requestedMinutes) && requestedMinutes > 0 ? requestedMinutes : maxMinutes,
      maxMinutes
    );
    const validUntil = new Date(Date.now() + windowMinutes * 60 * 1000);

    const grant = await repository.createGrant({
      subject: actor.id,
      patient: patient.id,
      permissions: effective,
      grantType: 'break-glass',
      status: 'active',
      validFrom: new Date(),
      validUntil,
      grantedBy: actor.id,
      grantedByRole: actor.roleName,
      grantedAt: new Date(),
      reason: String(reason).trim(),
      purpose: 'emergency',
      organization: actor.organization || patient.organization || null
    });

    await repository.writeAudit({
      event: 'breakglass.invoked',
      actor: actor.id,
      subject: actor.id,
      subjectRole: actor.roleName,
      patient: patient.id,
      permission: effective.join(','),
      allowed: true,
      reason: 'BREAK_GLASS',
      grant: grant.id,
      method: context.method || '',
      path: context.path || '',
      ip: context.ip || '',
      detail: { justification: String(reason).trim(), expiresAt: validUntil, windowMinutes }
    });

    return { grant, expiresAt: validUntil, windowMinutes };
  }

  /* ------------------------------------------------------------------ *
   * Role administration (RBAC)
   * ------------------------------------------------------------------ */

  async function assertCapability(actorId, capability) {
    const actor = await repository.getSubject(actorId);
    if (!actor) throw new AccessError(401, 'Authenticated user could not be resolved', 'SUBJECT_UNKNOWN');

    const status = String(actor.status || '').toLowerCase();
    if (status !== 'approved' && status !== 'active') {
      throw new AccessError(403, 'Your account is not active', 'SUBJECT_INACTIVE');
    }

    if (!buildCapabilityMatcher(actor.capabilities)(capability)) {
      throw new AccessError(403, `Your role does not carry the '${capability}' permission`, 'MISSING_CAPABILITY');
    }
    return actor;
  }

  async function validateRolePatch(actor, roleName, patch) {
    const key = normaliseRoleName(roleName);
    if (!key) throw new AccessError(400, 'A role name is required', 'ROLE_NAME_REQUIRED');
    if (!/^[a-z0-9][a-z0-9._-]{1,39}$/.test(key)) {
      throw new AccessError(
        400,
        'Role names must be 2-40 characters, lower case, and may contain letters, digits, dot, dash and underscore',
        'ROLE_NAME_INVALID'
      );
    }

    if (Array.isArray(patch.permissions)) {
      const codes = patch.permissions.map(normalisePermission).filter(Boolean);

      const unknown = codes.filter((code) => !isKnownPermission(code));
      if (unknown.length) {
        throw new AccessError(400, `Unknown permission(s): ${unknown.join(', ')}`, 'UNKNOWN_PERMISSION');
      }

      // A wildcard hands over every capability in one move, including
      // access.matrix:manage itself. Only someone already unscoped may do it —
      // otherwise a role administrator can promote themselves in one request.
      const wildcards = codes.filter((code) => code.includes('*'));
      if (wildcards.length && !actor.unscoped) {
        throw new AccessError(
          403,
          `Only an unscoped administrator may assign wildcard permission(s): ${wildcards.join(', ')}`,
          'WILDCARD_FORBIDDEN'
        );
      }
    }

    if (Array.isArray(patch.inherits) && patch.inherits.length) {
      const parents = patch.inherits.map(normaliseRoleName).filter(Boolean);
      const matrix = await repository.getRoleMatrix();

      const missing = parents.filter((parent) => !matrix[parent]);
      if (missing.length) {
        throw new AccessError(400, `Cannot inherit from unknown role(s): ${missing.join(', ')}`, 'UNKNOWN_PARENT_ROLE');
      }

      const cycling = await repository.checkInheritanceCycle(key, parents);
      if (cycling.length) {
        throw new AccessError(
          422,
          `Inheriting from ${cycling.join(', ')} would create a cycle`,
          'INHERITANCE_CYCLE'
        );
      }
    }

    // Only someone already unscoped may make a role unscoped. Otherwise a
    // doctor with matrix rights could quietly hand themselves the keys.
    if (patch.unscoped === true && !actor.unscoped) {
      throw new AccessError(403, 'Only an unscoped administrator may mark a role unscoped', 'UNSCOPED_FORBIDDEN');
    }

    return key;
  }

  async function createRole({ actorId, roleName, displayName, permissions, inherits, description, canGrant, unscoped, context = {} }) {
    const actor = await assertCapability(actorId, 'access.matrix:manage');
    const key = await validateRolePatch(actor, roleName, { permissions, inherits, unscoped });

    const result = await repository.createRole(key, {
      displayName,
      permissions: (permissions || []).map(normalisePermission).filter(Boolean),
      inherits: (inherits || []).map(normaliseRoleName).filter(Boolean),
      description,
      canGrant: Boolean(canGrant),
      unscoped: Boolean(unscoped)
    });

    if (!result.created) throw new AccessError(409, `Role '${key}' already exists`, 'ROLE_EXISTS');

    await repository.writeAudit({
      event: 'role.created',
      actor: actor.id,
      permission: (result.role.permissions || []).join(','),
      allowed: true,
      reason: 'ROLE_CREATED',
      method: context.method || '',
      path: context.path || '',
      ip: context.ip || '',
      detail: { roleName: key, inherits: result.role.inherits, canGrant: result.role.canGrant }
    });

    return result.role;
  }

  async function updateRole({ actorId, roleName, patch = {}, context = {} }) {
    const actor = await assertCapability(actorId, 'access.matrix:manage');
    const key = await validateRolePatch(actor, roleName, patch);

    const matrix = await repository.getRoleMatrix();
    const existing = matrix[key];

    // System roles keep their safety rails. Permissions stay editable.
    if (existing && existing.isSystem) {
      if (patch.unscoped === false && existing.unscoped) {
        throw new AccessError(422, `'${key}' is a system role and must stay unscoped`, 'SYSTEM_ROLE_PROTECTED');
      }
    }

    const updated = await repository.upsertRoleMatrix(key, patch, actor.id);

    await repository.writeAudit({
      event: existing ? 'role.updated' : 'role.created',
      actor: actor.id,
      permission: (updated.permissions || []).join(','),
      allowed: true,
      reason: existing ? 'ROLE_UPDATED' : 'ROLE_CREATED',
      method: context.method || '',
      path: context.path || '',
      ip: context.ip || '',
      detail: {
        roleName: key,
        permissions: updated.permissions,
        inherits: updated.inherits,
        unscoped: updated.unscoped,
        canGrant: updated.canGrant,
        previousPermissions: existing ? existing.permissions : null
      }
    });

    return updated;
  }

  async function deleteRole({ actorId, roleName, force = false, context = {} }) {
    const actor = await assertCapability(actorId, 'access.matrix:manage');
    const key = normaliseRoleName(roleName);

    const usage = await repository.roleUsage(key);
    if (usage.isSystem) {
      throw new AccessError(422, `'${key}' is a system role and cannot be deleted`, 'SYSTEM_ROLE_PROTECTED');
    }

    const holders = usage.primaryHolders + usage.assignedHolders;
    if (holders > 0 && !force) {
      throw new AccessError(
        409,
        `${holders} user(s) still hold '${key}'. Reassign them first, or pass force=true.`,
        'ROLE_IN_USE'
      );
    }
    if (usage.descendants.length) {
      throw new AccessError(
        409,
        `Role(s) ${usage.descendants.join(', ')} inherit from '${key}'. Detach them first.`,
        'ROLE_HAS_DESCENDANTS'
      );
    }

    // Revoke any assignments pointing at the role before it disappears,
    // otherwise they dangle and the resolver reports them as a missing role
    // forever. Primary roles live on User.role and cannot be cleaned up here —
    // report them so the caller knows what is left to fix by hand.
    let revokedAssignments = 0;
    if (usage.assignedHolders > 0) {
      const live = await repository.listRoleAssignments({ roleName: key, status: 'active' });
      for (const assignment of live.assignments) {
        await repository.updateRoleAssignment(assignment.id, {
          status: 'revoked',
          revokedBy: actor.id,
          revokedAt: new Date(),
          revocationReason: `Role '${key}' was deleted`
        });
        revokedAssignments += 1;
      }
    }

    const result = await repository.deleteRole(key);
    if (!result.deleted) throw new AccessError(404, `Role '${key}' not found`, 'ROLE_NOT_FOUND');

    await repository.writeAudit({
      event: 'role.deleted',
      actor: actor.id,
      allowed: true,
      reason: 'ROLE_DELETED',
      method: context.method || '',
      path: context.path || '',
      ip: context.ip || '',
      detail: {
        roleName: key,
        holdersAtDeletion: holders,
        forced: Boolean(force),
        revokedAssignments,
        orphanedPrimaryHolders: usage.primaryHolders
      }
    });

    return {
      roleName: key,
      deleted: true,
      holdersAtDeletion: holders,
      revokedAssignments,
      /* Users whose User.role still names the deleted role. They now resolve to
         zero capabilities and need a new primary role set on the user record. */
      orphanedPrimaryHolders: usage.primaryHolders
    };
  }

  /* ---------------- role membership ---------------- */

  async function assignRole({ actorId, userId, roleName, reason, validUntil, context = {} }) {
    const actor = await assertCapability(actorId, 'access.matrix:manage');
    const key = normaliseRoleName(roleName);

    const recipient = await repository.getSubject(userId);
    if (!recipient) throw new AccessError(404, 'User not found', 'USER_NOT_FOUND');

    const matrix = await repository.getRoleMatrix();
    if (!matrix[key]) throw new AccessError(404, `Role '${key}' not found`, 'ROLE_NOT_FOUND');

    if (matrix[key].unscoped && !actor.unscoped) {
      throw new AccessError(403, 'Only an unscoped administrator may assign an unscoped role', 'UNSCOPED_FORBIDDEN');
    }

    if ((recipient.roleNames || []).includes(key)) {
      throw new AccessError(409, `${recipient.fullname || 'That user'} already holds '${key}'`, 'ALREADY_HELD');
    }

    const existing = await repository.findRoleAssignment({ userId: recipient.id, roleName: key });
    if (existing) throw new AccessError(409, 'An active assignment already exists', 'ALREADY_ASSIGNED');

    const assignment = await repository.createRoleAssignment({
      user: recipient.id,
      roleName: key,
      isPrimary: false,
      assignedBy: actor.id,
      reason: String(reason || '').trim(),
      validUntil: validUntil ? new Date(validUntil) : null
    });

    await repository.writeAudit({
      event: 'role.assigned',
      actor: actor.id,
      subject: recipient.id,
      subjectRole: key,
      allowed: true,
      reason: 'ROLE_ASSIGNED',
      method: context.method || '',
      path: context.path || '',
      ip: context.ip || '',
      detail: { roleName: key, justification: String(reason || '').trim(), validUntil: assignment.validUntil }
    });

    const after = await repository.getSubject(recipient.id);
    return { assignment, effectiveRoles: after.roleNames, effectiveCapabilities: after.capabilities };
  }

  async function unassignRole({ actorId, assignmentId, reason, context = {} }) {
    const actor = await assertCapability(actorId, 'access.matrix:manage');

    const assignment = await repository.findRoleAssignmentById(assignmentId);
    if (!assignment) throw new AccessError(404, 'Role assignment not found', 'ASSIGNMENT_NOT_FOUND');
    if (assignment.status === 'revoked') return { assignment, alreadyRevoked: true };

    if (assignment.isPrimary) {
      throw new AccessError(
        422,
        "This is the user's primary role. Change it on the user record rather than here.",
        'PRIMARY_ROLE_PROTECTED'
      );
    }

    const updated = await repository.updateRoleAssignment(assignment.id, {
      status: 'revoked',
      revokedBy: actor.id,
      revokedAt: new Date(),
      revocationReason: String(reason || '').trim()
    });

    await repository.writeAudit({
      event: 'role.unassigned',
      actor: actor.id,
      subject: assignment.user,
      subjectRole: assignment.roleName,
      allowed: true,
      reason: 'ROLE_UNASSIGNED',
      method: context.method || '',
      path: context.path || '',
      ip: context.ip || '',
      detail: { roleName: assignment.roleName, revocationReason: String(reason || '').trim() }
    });

    const after = await repository.getSubject(assignment.user);
    return { assignment: updated, alreadyRevoked: false, effectiveRoles: after ? after.roleNames : [] };
  }

  /**
   * Why does this user hold what they hold? Shows each role, the inheritance
   * chain it expanded through, and the union that resulted.
   */
  async function explainRoles({ userId }) {
    const subject = await repository.getSubject(userId);
    if (!subject) throw new AccessError(404, 'User not found', 'USER_NOT_FOUND');

    const matrix = await repository.getRoleMatrix();
    const resolved = resolveRoles(subject.roleNames || [subject.roleName], matrix);
    const assignments = await repository.listRoleAssignments({ user: subject.id });

    return {
      user: { id: subject.id, fullname: subject.fullname, email: subject.email, status: subject.status },
      primaryRole: subject.roleName,
      effectiveRoles: resolved.roleNames,
      capabilities: resolved.capabilities.sort(),
      unscoped: resolved.unscoped,
      canGrant: resolved.canGrant,
      perRole: resolved.roleNames.map((roleName) => {
        const expanded = expandRole(roleName, matrix);
        return {
          roleName,
          inheritanceChain: expanded.chain,
          contributes: expanded.permissions.sort(),
          unscoped: expanded.unscoped,
          canGrant: expanded.canGrant,
          cycles: expanded.cycles,
          missingParents: expanded.missing
        };
      }),
      assignments: assignments.assignments,
      warnings: [
        ...(resolved.cycles.length ? [`Inheritance cycle involving: ${resolved.cycles.join(', ')}`] : []),
        ...(resolved.missing.length ? [`Inherits from unknown role(s): ${resolved.missing.join(', ')}`] : [])
      ]
    };
  }

  /* ------------------------------------------------------------------ *
   * Read-side helpers for the console
   * ------------------------------------------------------------------ */

  async function explain({ userId, patientId, permission }) {
    const decision = await check({ userId, patientId, permission, audit: false });
    const grants = decision.subject
      ? await repository.getGrants({ subjectId: decision.subject.id, patientId })
      : [];

    return {
      allowed: decision.allowed,
      reason: decision.reason,
      status: decision.status,
      message: decision.message,
      grantId: decision.grantId,
      grantType: decision.grantType,
      relationship: decision.relationship,
      subject: decision.subject
        ? {
            id: decision.subject.id,
            fullname: decision.subject.fullname,
            roleName: decision.subject.roleName,
            roleNames: decision.subject.roleNames || [decision.subject.roleName],
            roleChains: decision.subject.roleChains || {},
            status: decision.subject.status,
            capabilities: decision.subject.capabilities,
            unscoped: decision.subject.unscoped
          }
        : null,
      patient: decision.patient ? { id: decision.patient.id, fullname: decision.patient.fullname } : null,
      consideredGrants: grants.map((grant) => ({
        id: grant.id,
        permissions: grant.permissions,
        status: grant.status,
        grantType: grant.grantType,
        validFrom: grant.validFrom,
        validUntil: grant.validUntil,
        verdict: policy.classifyGrant(grant, permission, new Date())
      }))
    };
  }

  return {
    options: settings,
    repository,
    catalogue: PERMISSIONS,
    check,
    authorisedPatientIds,
    issueGrant,
    revokeGrant,
    invokeBreakGlass,
    explain,
    createRole,
    updateRole,
    deleteRole,
    assignRole,
    unassignRole,
    explainRoles,
    roleUsage: (...args) => repository.roleUsage(...args),
    listRoleAssignments: (...args) => repository.listRoleAssignments(...args),
    listGrants: (...args) => repository.listGrants(...args),
    listAudit: (...args) => repository.listAudit(...args),
    listUsers: (...args) => repository.listUsers(...args),
    listPatients: (...args) => repository.listPatients(...args),
    getRoleMatrix: () => repository.getRoleMatrix(),
    upsertRoleMatrix: (...args) => repository.upsertRoleMatrix(...args)
  };
}

/* ------------------------------------------------------------------ *
 * Default singleton (mongo-backed) used by the app at runtime
 * ------------------------------------------------------------------ */

let defaultService = null;

function getDefaultService() {
  if (!defaultService) {
    const { createMongoRepository } = require('./accessRepository.mongo');
    defaultService = createAccessControlService({ repository: createMongoRepository() });
  }
  return defaultService;
}

/** Test seam: lets a test app inject the in-memory service. */
function setDefaultService(service) {
  defaultService = service;
}

module.exports = {
  AccessError,
  createAccessControlService,
  getDefaultService,
  setDefaultService,
  DEFAULT_SERVICE_OPTIONS
};
