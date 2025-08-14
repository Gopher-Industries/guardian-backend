const jwt = require('jsonwebtoken');
const { log: audit } = require('../utils/audit'); 

const verifyToken = (req, res, next) => {
  const authHeader = req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    // AUDIT: invalid token format
    audit(req, {
      category: 'auth',
      action: 'token_invalid',
      severity: 'medium',
      meta: { reason: 'invalid_format' },
    });
    return res.status(401).json({ message: 'Access denied. Invalid token format.' });
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    // AUDIT: missing token
    audit(req, {
      category: 'auth',
      action: 'token_invalid',
      severity: 'medium',
      meta: { reason: 'missing_token' },
    });
    return res.status(401).json({ message: 'Access denied. No token provided.' });
  }

  try {
    const verified = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    req.user = verified;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      // AUDIT: expired token
      audit(req, {
        category: 'auth',
        action: 'token_expired',
        severity: 'medium',
        meta: { reason: 'jwt_expired' },
      });
      return res.status(401).json({ message: 'Access denied. Token has expired.' });
    }
    // AUDIT: invalid token signature or decoding
    audit(req, {
      category: 'auth',
      action: 'token_invalid',
      severity: 'medium',
      meta: { reason: error.message.slice(0, 120) },
    });
    res.status(400).json({ message: 'Invalid token.' });
  }
};

module.exports = verifyToken;
