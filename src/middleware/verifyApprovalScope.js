const mongoose = require('mongoose');
const User = require('../models/User');
const { findAdminOrg } = require('../services/orgService');

async function verifyApprovalScope(req, res, next) {
  const { userId } = req.params;
  if (!mongoose.isObjectIdOrHexString(userId)) {
    return res.status(400).json({ error: 'Invalid user ID' });
  }

  try {
    const target = await User.findById(userId).select('organization').lean();
    if (!target) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!target.organization) {
      return res.status(403).json({ error: 'Approval outside your organisation scope' });
    }

    const org = await findAdminOrg(req.user._id, target.organization);
    if (org.active === false) {
      return res.status(403).json({ error: 'Approval outside your organisation scope' });
    }

    req.approvalScope = {
      targetId: target._id,
      organizationId: org._id,
      approverId: req.user._id
    };
    return next();
  } catch (error) {
    if (error.status === 404) {
      return res.status(403).json({ error: 'Approval outside your organisation scope' });
    }

    console.error('Error verifying approval scope:', error);
    return res.status(500).json({ error: 'Failed to check approval scope' });
  }
}

module.exports = verifyApprovalScope;