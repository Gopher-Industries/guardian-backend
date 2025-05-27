const User = require('../models/User');

// Middleware to verify if the user has the required role
const verifyRole = (roles) => async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).populate('role');
    if (!user || !user.role || !user.role.name) {
      return res.status(403).json({ message: 'Access denied. Insufficient permissions.' });
    }

    const userRole = await user.role.name;
    if (!roles.includes(userRole)) {
      return res.status(403).json({ message: 'Access denied. Insufficient permissions.' });
    }

    next();
  } catch (error) {
    console.error('Error verifying user role:', error);
    res.status(500).json({ message: 'Failed to check user role' });
  }
};

module.exports = verifyRole;
