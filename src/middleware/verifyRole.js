// Middleware to verify if the user has the required role
const verifyRole = (roles) => async (req, res, next) => {
  try {
    const { role } = req.user;
    
    if (!roles.includes(role)) {
      return res.status(403).json({ message: 'Access denied. Insufficient permissions.' });
    }

    next();
  } catch (error) {
    res.status(500).json({ message: 'Failed to check user role', error: error.message });
  }
};

module.exports = verifyRole;
