const User = require('../models/User');

// Middleware to verify if the user has one of the required roles
// Its flexible so it works with both verifyRole('nurse') and verifyRole(['nurse'])
function verifyRole(roles) {
  const allowedRoles = (Array.isArray(roles) ? roles : [roles]).map(role => String(role).toLowerCase());

  return async (req, res, next) => {

    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ message: 'Access denied. Authentication required.' });
    }

    try {
      const user = await User.findById(userId).populate('role', 'name');
      const userRole = user?.role?.name?.toLowerCase();

      if (!userRole || !allowedRoles.includes(userRole)) {
        return res.status(403).json({ message: 'Access denied. Insufficient permissions.' });
      }

      // saving the resolved role on req in case needed later in other middleware/controller logic
      req.userRole = userRole;
      return next();
    } catch (error) {
      console.error('Error verifying user role:', error);
      return res.status(500).json({ message: 'Failed to check user role' });
    }
  };
};

module.exports = verifyRole;