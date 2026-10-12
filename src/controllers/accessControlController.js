'use strict';

/**
 * Guardian — access-control controller.
 *
 * Everything the administration console drives. Each handler resolves the
 * service from req.app.locals so tests can inject the in-memory build.
 *
 * @author   Graeme Thomas
 * @module   guardian-access-control
 * @version  1.1.0
 */

const { getDefaultService, AccessError } = require('../access/accessControlService');
const { PERMISSIONS } = require('../access/permissions');
const policy = require('../access/policy');

function service(req) {
  return (req.app && req.app.locals && req.app.locals.accessControl) || getDefaultService();
}

function actorId(req) {
  return req.user && (req.user._id || req.user.id);
}

function context(req) {
  return {
    method: req.method,
    path: req.originalUrl || req.url,
    ip: req.ip || req.headers['x-forwarded-for'] || '',
    userAgent: req.headers['user-agent'] || ''
  };
}

function fail(res, error) {
  if (error instanceof AccessError || error.status) {
    return res.status(error.status || 400).json({ message: error.message, code: error.code || 'ACCESS_ERROR' });
  }
  console.error('[access-control]', error);
  return res.status(500).json({ message: 'Access control operation failed' });
}

/* ------------------------------------------------------------------ *
 * Catalogue and matrix
 * ------------------------------------------------------------------ */

exports.getPermissionCatalogue = async (_req, res) => {
  res.status(200).json({ permissions: PERMISSIONS, reasonCodes: policy.REASONS });
};

exports.getRoleMatrix = async (req, res) => {
  try {
    const matrix = await service(req).getRoleMatrix();
    res.status(200).json({ matrix, permissions: PERMISSIONS });
  } catch (error) {
    fail(res, error);
  }
};

exports.updateRoleMatrix = async (req, res) => {
  try {
    const role = await service(req).updateRole({
      actorId: actorId(req),
      roleName: req.params.roleName,
      patch: req.body || {},
      context: context(req)
    });
    res.status(200).json({ role });
  } catch (error) {
    fail(res, error);
  }
};

/* ------------------------------------------------------------------ *
 * Role lifecycle (RBAC)
 * ------------------------------------------------------------------ */

exports.createRole = async (req, res) => {
  try {
    const { roleName, displayName, permissions, inherits, description, canGrant, unscoped, cloneFrom } = req.body || {};
    if (!roleName) return res.status(400).json({ message: 'roleName is required' });

    const svc = service(req);

    // Cloning is just a create pre-filled from an existing role's own list.
    let seedPermissions = permissions;
    let seedInherits = inherits;
    if (cloneFrom) {
      const matrix = await svc.getRoleMatrix();
      const source = matrix[String(cloneFrom).toLowerCase()];
      if (!source) return res.status(404).json({ message: `Role '${cloneFrom}' not found`, code: 'ROLE_NOT_FOUND' });
      seedPermissions = permissions || source.permissions;
      seedInherits = inherits || source.inherits;
    }

    const role = await svc.createRole({
      actorId: actorId(req),
      roleName,
      displayName,
      permissions: seedPermissions,
      inherits: seedInherits,
      description,
      canGrant,
      unscoped,
      context: context(req)
    });

    res.status(201).json({ message: `Role '${role.roleName}' created`, role });
  } catch (error) {
    fail(res, error);
  }
};

exports.deleteRole = async (req, res) => {
  try {
    const result = await service(req).deleteRole({
      actorId: actorId(req),
      roleName: req.params.roleName,
      force: String(req.query.force || '') === 'true',
      context: context(req)
    });
    res.status(200).json({ message: `Role '${result.roleName}' deleted`, ...result });
  } catch (error) {
    fail(res, error);
  }
};

exports.roleUsage = async (req, res) => {
  try {
    const usage = await service(req).roleUsage(req.params.roleName);
    res.status(200).json(usage);
  } catch (error) {
    fail(res, error);
  }
};

/* ------------------------------------------------------------------ *
 * Role membership (multi-role)
 * ------------------------------------------------------------------ */

exports.listRoleAssignments = async (req, res) => {
  try {
    const result = await service(req).listRoleAssignments({
      user: req.query.user,
      roleName: req.query.roleName,
      status: req.query.status
    });
    res.status(200).json(result);
  } catch (error) {
    fail(res, error);
  }
};

exports.assignRole = async (req, res) => {
  try {
    const { userId, roleName, reason, validUntil } = req.body || {};
    if (!userId || !roleName) return res.status(400).json({ message: 'userId and roleName are required' });

    const result = await service(req).assignRole({
      actorId: actorId(req),
      userId,
      roleName,
      reason,
      validUntil,
      context: context(req)
    });

    res.status(201).json({ message: `Role '${roleName}' assigned`, ...result });
  } catch (error) {
    fail(res, error);
  }
};

exports.unassignRole = async (req, res) => {
  try {
    const result = await service(req).unassignRole({
      actorId: actorId(req),
      assignmentId: req.params.assignmentId,
      reason: (req.body && req.body.reason) || req.query.reason,
      context: context(req)
    });
    res.status(200).json({
      message: result.alreadyRevoked ? 'Assignment was already revoked' : 'Role removed',
      ...result
    });
  } catch (error) {
    fail(res, error);
  }
};

exports.explainRoles = async (req, res) => {
  try {
    const result = await service(req).explainRoles({ userId: req.params.userId });
    res.status(200).json(result);
  } catch (error) {
    fail(res, error);
  }
};

/* ------------------------------------------------------------------ *
 * Grants
 * ------------------------------------------------------------------ */

exports.listGrants = async (req, res) => {
  try {
    const { subject, patient, status, grantType, page, limit } = req.query;
    const result = await service(req).listGrants(
      { subject, patient, status, grantType },
      { page: Math.max(parseInt(page, 10) || 1, 1), limit: Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200) }
    );
    res.status(200).json(result);
  } catch (error) {
    fail(res, error);
  }
};

exports.issueGrant = async (req, res) => {
  try {
    const { subjectId, patientId, permissions, reason, purpose, validFrom, validUntil } = req.body || {};
    if (!subjectId || !patientId) {
      return res.status(400).json({ message: 'subjectId and patientId are required' });
    }

    const result = await service(req).issueGrant({
      actorId: actorId(req),
      subjectId,
      patientId,
      permissions,
      reason,
      purpose,
      validFrom,
      validUntil,
      context: context(req)
    });

    res.status(201).json({
      message: 'Access granted',
      grant: result.grant,
      droppedByRoleCeiling: result.droppedByRoleCeiling
    });
  } catch (error) {
    fail(res, error);
  }
};

exports.revokeGrant = async (req, res) => {
  try {
    const result = await service(req).revokeGrant({
      actorId: actorId(req),
      grantId: req.params.grantId,
      reason: (req.body && req.body.reason) || req.query.reason,
      context: context(req)
    });

    res.status(200).json({
      message: result.alreadyRevoked ? 'Grant was already revoked' : 'Access revoked',
      grant: result.grant
    });
  } catch (error) {
    fail(res, error);
  }
};

exports.invokeBreakGlass = async (req, res) => {
  try {
    const { patientId, permissions, reason, minutes } = req.body || {};
    if (!patientId) return res.status(400).json({ message: 'patientId is required' });

    const result = await service(req).invokeBreakGlass({
      actorId: actorId(req),
      patientId,
      permissions,
      reason,
      minutes,
      context: context(req)
    });

    res.status(201).json({
      message: `Emergency access granted for ${result.windowMinutes} minutes. This has been recorded and will be reviewed.`,
      grant: result.grant,
      expiresAt: result.expiresAt
    });
  } catch (error) {
    fail(res, error);
  }
};

/* ------------------------------------------------------------------ *
 * Read side
 * ------------------------------------------------------------------ */

exports.myAuthorisedPatients = async (req, res) => {
  try {
    const svc = service(req);
    const permission = req.query.permission || 'patient:read';
    const ids = await svc.authorisedPatientIds({ userId: actorId(req), permission });
    const patients = await svc.listPatients({ limit: 500 });
    const allowed = patients.filter((patient) => ids.includes(patient.id));

    res.status(200).json({ permission, total: allowed.length, patients: allowed });
  } catch (error) {
    fail(res, error);
  }
};

exports.patientSubjects = async (req, res) => {
  try {
    const svc = service(req);
    const result = await svc.listGrants({ patient: req.params.patientId }, { limit: 200 });
    res.status(200).json(result);
  } catch (error) {
    fail(res, error);
  }
};

exports.explainDecision = async (req, res) => {
  try {
    const { userId, patientId, permission } = req.body || {};
    if (!userId || !permission) {
      return res.status(400).json({ message: 'userId and permission are required' });
    }
    const result = await service(req).explain({ userId, patientId, permission });
    res.status(200).json(result);
  } catch (error) {
    fail(res, error);
  }
};

exports.listAudit = async (req, res) => {
  try {
    const { subject, patient, event, allowed, page, limit } = req.query;
    const result = await service(req).listAudit(
      {
        subject,
        patient,
        event,
        allowed: allowed === undefined ? undefined : String(allowed) === 'true'
      },
      { page: Math.max(parseInt(page, 10) || 1, 1), limit: Math.min(Math.max(parseInt(limit, 10) || 100, 1), 500) }
    );
    res.status(200).json(result);
  } catch (error) {
    fail(res, error);
  }
};

exports.listUsers = async (req, res) => {
  try {
    const users = await service(req).listUsers({ search: req.query.search, role: req.query.role, limit: 200 });
    res.status(200).json({ total: users.length, users });
  } catch (error) {
    fail(res, error);
  }
};

exports.listPatients = async (req, res) => {
  try {
    const patients = await service(req).listPatients({ search: req.query.search, limit: 200 });
    res.status(200).json({ total: patients.length, patients });
  } catch (error) {
    fail(res, error);
  }
};

/* ------------------------------------------------------------------ *
 * Demo protected resource (used by the test harness and the console)
 * ------------------------------------------------------------------ */

exports.demoPatientRecord = async (req, res) => {
  const decision = req.accessDecision || {};
  res.status(200).json({
    message: 'Patient record released',
    patient: decision.patient || { id: req.authorisedPatientId },
    authorisedBy: decision.reason,
    grantId: decision.grantId || null
  });
};
