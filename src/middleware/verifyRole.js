const User = require('../models/User');
const { log: audit } = require('../utils/audit'); 

// Middleware to verify if the user has the required role(s)
const verifyRole = (roles) => async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).populate('role');
    if (!user || !user.role || !user.role.name) {
      // AUDIT: missing role on user
      audit(req, {
        category: 'authorization',
        action: 'permission_denied',
        severity: 'medium',
        meta: { reason: 'missing_role' },
      });
      return res.status(403).json({ message: 'Access denied. Insufficient permissions.' });
    }

    const userRole = await user.role.name;
    if (!roles.includes(userRole)) {
      // AUDIT: role not allowed
      audit(req, {
        category: 'authorization',
        action: 'permission_denied',
        actor: user._id,
        severity: 'medium',
        meta: { reason: 'role_not_allowed', required: roles, actual: userRole },
      });
      return res.status(403).json({ message: 'Access denied. Insufficient permissions.' });
    }

    next();
  } catch (error) {
    console.error('Error verifying user role:', error);
    // AUDIT: role check failure (system)
    audit(req, {
      category: 'authorization',
      action: 'permission_check_failed',
      severity: 'high',
      meta: { reason: error.message.slice(0, 120) },
    });
    res.status(500).json({ message: 'Failed to check user role' });
  }
};

module.exports = verifyRole;
