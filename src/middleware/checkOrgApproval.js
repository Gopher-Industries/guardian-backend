const User = require('../models/User');

const checkOrgApproval = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).populate('role', 'name');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const roleName = user.role?.name?.toLowerCase();

    // only nurse and caretaker are part of this approval flow
    if (!['nurse', 'caretaker'].includes(roleName)) {
      return next();
    }

    // freelance users should still be allowed to continue their independent workflow
    if (!user.organization) {
      return next();
    }

    // org-linked users must be approved before using org workflow
    if (user.approvalStatus !== 'approved') {
      return res.status(403).json({
        message: 'Your organization account is not approved yet. Please contact your admin.',
        approvalStatus: user.approvalStatus
      });
    }

    next();
  } catch (error) {
    console.error('Error checking organization approval:', error);
    return res.status(500).json({ message: 'Failed to verify organization approval status' });
  }
};

module.exports = checkOrgApproval;