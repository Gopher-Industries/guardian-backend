const User = require('../models/User');

module.exports = async function attachContext(req, res, next) {
  try {
    if (!req.user?._id) return res.status(401).json({ message: 'Unauthorized' });

    const me = await User.findById(req.user._id)
      .populate('role')
      .populate('organization');

    if (!me) return res.status(401).json({ message: 'Unauthorized' });

    req.ctx = {
      me,
      roleName: me.role?.name?.toLowerCase() || 'user',
      orgId: me.organization ? String(me.organization._id) : null,
      isOrgMember: !!me.organization
    };

    next();
  } catch (e) {
    next(e);
  }
};
