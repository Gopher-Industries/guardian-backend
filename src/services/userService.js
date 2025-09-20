// Role helpers for validating users by role and optional org updates.

const mongoose = require('mongoose');
const Role = require('../models/Role');
const User = require('../models/User');

// get role document by name (e.g. nurse, doctor, caretaker, admin)
const getRoleByName = async (name) => {
  return Role.findOne({ name: String(name).toLowerCase() }).lean();
};

// normalize different id formats into a clean 24-hex string
function normalizeId(input) {
  if (!input) return null;

  // already valid ObjectId
  if (mongoose.isValidObjectId(input)) return String(input);

  // object or mongoose doc with _id / id / userId / orgId
  if (typeof input === 'object') {
    const v = input._id ?? input.id ?? input.userId ?? input.orgId;
    if (mongoose.isValidObjectId(v)) return String(v);
  }

  // string variants (ObjectId("..."), new ObjectId("..."), or plain hex)
  if (typeof input === 'string') {
    const m = input.match(
      /ObjectId\(["']([0-9a-fA-F]{24})["']\)|new\s+ObjectId\(["']([0-9a-fA-F]{24})["']\)|([0-9a-fA-F]{24})/
    );
    const hex = (m && (m[1] || m[2] || m[3])) ? (m[1] || m[2] || m[3]) : null;
    if (hex && mongoose.isValidObjectId(hex)) return hex;
  }

  return null;
}

// check if user exists and matches the given role (returns user doc or null)
const ensureUserWithRole = async (userId, roleName) => {
  const id = normalizeId(userId);
  if (!id) return null;

  const user = await User.findById(id).populate('role', 'name');
  if (!user) return null;
  if (!user.role || user.role.name !== String(roleName).toLowerCase()) return null;
  return user;
};

// set or update a user's organization field
const setUserOrganization = async (userId, orgId) => {
  const id = normalizeId(userId);
  const org = normalizeId(orgId);
  if (!id || !org) return;
  await User.updateOne({ _id: id }, { $set: { organization: org } });
};

module.exports = {
  getRoleByName,
  ensureUserWithRole,
  setUserOrganization,
};
