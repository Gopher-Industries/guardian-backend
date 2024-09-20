const UserRole = require('../models/UserRole');

// Middleware to verify if the user has the required role
const verifyRole = (roles) => async (req, res, next) => {
  try {
    const userRole = await UserRole.findOne({ user_id: req.user._id });
    
    if (!userRole || !roles.includes(userRole.role_name)) {
      return res.status(403).json({ message: 'Access denied. Insufficient permissions.' });
    }

    next();
  } catch (error) {
    res.status(500).json({ message: 'Failed to check user role' });
  }
};

module.exports = verifyRole;
