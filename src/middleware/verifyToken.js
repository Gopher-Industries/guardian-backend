const jwt = require('jsonwebtoken');

const verifyToken = (req, res, next) => {
  const authHeader = req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Access denied. Invalid token format.' });
  }

  const token = authHeader.split(' ')[1]; // Extract the token part
  if (!token) {
    return res.status(401).json({ message: 'Access denied. No token provided.' });
  }

  try {
    const verified = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] }); // Specify algorithm
    req.user = verified;

    // Optional: Add role-based access control (RBAC) here
    // if (req.user.role !== 'admin') {
    //   return res.status(403).json({ message: 'Access denied. Insufficient permissions.' });
    // }

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Access denied. Token has expired.' });
    }
    res.status(400).json({ message: 'Invalid token.' });
  }
};

module.exports = verifyToken;
