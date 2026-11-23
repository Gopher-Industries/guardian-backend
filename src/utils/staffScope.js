const Organization = require('../models/Organization');
const User = require('../models/User');

// Escape user input before putting it in a RegExp so search text can't
// change the pattern or make it very slow.
function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Build a filter that limits a staff listing to people in the caller's
// organizations: their own organization plus any they created or are staff of.
// A caller with no organization only gets an empty result.
async function buildStaffOrgFilter(userId) {
  const caller = await User.findById(userId).select('_id organization').lean();
  if (!caller) return null;

  const orgs = await Organization.find({
    $or: [
      { _id: caller.organization || null },
      { createdBy: caller._id },
      { staff: caller._id },
    ],
  }).select('_id staff').lean();

  if (!orgs.length) return null;

  const orgIds = orgs.map(org => org._id);
  const staffIds = orgs.flatMap(org => org.staff || []);

  return {
    $or: [
      { organization: { $in: orgIds } },
      { _id: { $in: staffIds } },
    ],
  };
}

module.exports = { escapeRegex, buildStaffOrgFilter };
