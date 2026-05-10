const User = require('../models/User');

// Middleware to verify if the user has one of the required roles
// Its flexible so it works with both verifyRole('nurse') and verifyRole(['nurse'])
const verifyRole = (roles) => {
  const allowedRoles = Array.isArray(roles) ? roles : [roles];

  return async (req, res, next) => {
    try {
      const user = await User.findById(req.user._id).populate('role', 'name');

      if (!user || !user.role || !user.role.name) {
        return res.status(403).json({ message: 'Access denied. Insufficient permissions.' });
      }

      const userRole = String(user.role.name).toLowerCase();
      const normalizedAllowedRoles = allowedRoles.map(role => String(role).toLowerCase());

      // saving the resolved role on req in case needed later in other middleware/controller logic
      req.userRole = userRole;

      if (!normalizedAllowedRoles.includes(userRole)) {
        return res.status(403).json({ message: 'Access denied. Insufficient permissions.' });
      }

      next();
    } catch (error) {
      console.error('Error verifying user role:', error);
      return res.status(500).json({ message: 'Failed to check user role' });
    }
  };
};

module.exports = verifyRole;