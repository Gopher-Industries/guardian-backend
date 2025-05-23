const jwt = require('jsonwebtoken');

const verifyToken = (req, res, next) => {
  const authHeader = req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Access denied. No token provided or malformed header.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // Includes _id, email, role, etc.
    next();
  } catch (error) {
    console.error('[verifyToken] Invalid token:', error.message); // optional logging
    res.status(401).json({ message: 'Invalid token.' });
  }
};

module.exports = verifyToken;
