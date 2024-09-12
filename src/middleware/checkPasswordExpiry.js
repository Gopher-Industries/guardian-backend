const User = require('../models/User');

const checkPasswordExpiry = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    const daysSinceLastChange = Math.floor((Date.now() - user.lastPasswordChange.getTime()) / (1000 * 60 * 60 * 24));

    if (daysSinceLastChange >= 90) {
      return res.status(403).json({ message: 'Your password has expired. Please change your password.' });
    }
    const daysRemaining = 90 - daysSinceLastChange;
    if (daysRemaining <= 5) {
      res.locals.passwordExpiryReminder = `Your password will expire in ${daysRemaining} days. Please change it soon.`;
    }

    next();
  } catch (error) {
    res.status(500).json({ message: 'Server error while checking password expiry.' });
  }
};

module.exports = checkPasswordExpiry;
