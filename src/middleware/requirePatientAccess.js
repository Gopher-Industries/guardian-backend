'use strict';

/**
 * Guardian — patient-scoped authorisation middleware.
 *
 * Drop it in after verifyToken on any route that touches a single patient:
 *
 *   router.get(
 *     '/patients/:patientId/vitals',
 *     verifyToken,
 *     requirePatientAccess('patient.vitals:read'),
 *     controller.getVitals
 *   );
 *
 * On success it hangs the resolved patient and the decision on the request:
 *   req.accessDecision  the full decision object (reason code, grant id, ...)
 *   req.authorisedPatientId
 *
 * The client-supplied patient identifier is never trusted — the relationship
 * is resolved server side before anything is returned.
 *
 * @author   Graeme Thomas
 * @module   guardian-access-control
 * @version  1.1.0
 */

const { getDefaultService } = require('../access/accessControlService');

function resolveService(req) {
  return (req.app && req.app.locals && req.app.locals.accessControl) || getDefaultService();
}

function defaultPatientIdFrom(req, sources) {
  for (const source of sources) {
    const value =
      (req.params && req.params[source]) ||
      (req.query && req.query[source]) ||
      (req.body && req.body[source]);
    if (value) return String(value);
  }
  return null;
}

function requestContext(req) {
  return {
    method: req.method,
    path: req.originalUrl || req.url,
    ip: req.ip || req.headers['x-forwarded-for'] || '',
    userAgent: req.headers['user-agent'] || ''
  };
}

/**
 * @param {string} permission           e.g. 'patient:read'
 * @param {object} [config]
 * @param {string[]} [config.sources]   where to look for the patient id
 * @param {boolean} [config.optional]   when true, a missing patient id passes
 *                                      through (list endpoints scope themselves)
 */
function requirePatientAccess(permission, config = {}) {
  const sources = config.sources || ['patientId', 'patient_id', 'patient', 'id'];

  return async function patientAccessGuard(req, res, next) {
    try {
      const userId = req.user && (req.user._id || req.user.id);
      if (!userId) {
        return res.status(401).json({ message: 'Access denied. No authenticated user.' });
      }

      const patientId = config.patientIdFrom ? config.patientIdFrom(req) : defaultPatientIdFrom(req, sources);

      if (!patientId) {
        if (config.optional) return next();
        return res.status(400).json({ message: 'A patientId is required for this request' });
      }

      const service = resolveService(req);
      const decision = await service.check({
        userId,
        patientId,
        permission,
        context: requestContext(req)
      });

      if (!decision.allowed) {
        return res.status(decision.status || 403).json({
          message: decision.message,
          reason: decision.reason,
          permission
        });
      }

      req.accessDecision = decision;
      req.authorisedPatientId = decision.patient ? decision.patient.id : patientId;
      return next();
    } catch (error) {
      console.error('[access-control] requirePatientAccess failed:', error);
      return res.status(error.status || 500).json({ message: 'Failed to evaluate patient access' });
    }
  };
}

/**
 * System-wide (non patient-scoped) capability gate, e.g. 'access.audit:read'.
 */
function requirePermission(permission) {
  return async function permissionGuard(req, res, next) {
    try {
      const userId = req.user && (req.user._id || req.user.id);
      if (!userId) return res.status(401).json({ message: 'Access denied. No authenticated user.' });

      const service = resolveService(req);
      const subject = await service.repository.getSubject(userId);
      if (!subject) return res.status(401).json({ message: 'Authenticated user could not be resolved' });

      const { buildCapabilityMatcher } = require('../access/permissions');
      const allowed = buildCapabilityMatcher(subject.capabilities)(permission);

      // Audit both outcomes, on the same terms the patient-scoped path uses.
      // A pure-RBAC route that recorded only its denials would leave successful
      // use of an administrative endpoint invisible.
      const auditAllows = !service.options || service.options.auditAllows !== false;
      if (!allowed || auditAllows) {
        await service.repository.writeAudit({
          event: 'access.decision',
          subject: subject.id,
          subjectRole: (subject.roleNames || [subject.roleName]).join(','),
          permission,
          allowed,
          reason: allowed ? 'ALLOW_ROLE_CAPABILITY' : 'DENY_ROLE_LACKS_CAPABILITY',
          method: req.method,
          path: req.originalUrl || req.url,
          ip: req.ip || ''
        });
      }

      if (!allowed) {
        return res.status(403).json({
          message: `Your role does not carry the '${permission}' permission`,
          reason: 'DENY_ROLE_LACKS_CAPABILITY',
          permission
        });
      }

      req.accessSubject = subject;
      return next();
    } catch (error) {
      console.error('[access-control] requirePermission failed:', error);
      return res.status(500).json({ message: 'Failed to evaluate permission' });
    }
  };
}

/**
 * Scope a list endpoint. Puts the authorised patient ids on the request so the
 * controller can fold them straight into its mongo filter.
 */
function scopePatientList(permission = 'patient:read') {
  return async function listScopeGuard(req, res, next) {
    try {
      const userId = req.user && (req.user._id || req.user.id);
      if (!userId) return res.status(401).json({ message: 'Access denied. No authenticated user.' });

      const service = resolveService(req);
      req.authorisedPatientIds = await service.authorisedPatientIds({ userId, permission });
      return next();
    } catch (error) {
      console.error('[access-control] scopePatientList failed:', error);
      return res.status(500).json({ message: 'Failed to scope patient list' });
    }
  };
}

module.exports = requirePatientAccess;
module.exports.requirePatientAccess = requirePatientAccess;
module.exports.requirePermission = requirePermission;
module.exports.scopePatientList = scopePatientList;
