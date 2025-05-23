const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

function generateToken(userPayload) {
  return jwt.sign(userPayload, process.env.JWT_SECRET, { expiresIn: '1h' });
}

async function hashPassword(password) {
  const salt = await bcrypt.genSalt(10);
  return await bcrypt.hash(password, salt);
}

async function validatePassword(raw, hash) {
  return await bcrypt.compare(raw, hash);
}

module.exports = { generateToken, hashPassword, validatePassword };