const mongoose = require('mongoose');
const Organization = require('../models/Organization');
const User = require('../models/User');

/* ----------------------------- Small helpers ----------------------------- */

// compare 2 ids safely
const idsEqual = (a, b) => a && b && String(a) === String(b);

// convert many possible formats into a valid id string
function toId(x) {
  if (!x) return undefined;

  // already valid ObjectId / 24-hex
  if (mongoose.isValidObjectId(x)) return String(x);

  // mongoose doc or plain object
  if (typeof x === 'object') {
    const v = x._id ?? x.id ?? x.orgId ?? x.userId;
    if (mongoose.isValidObjectId(v)) return String(v);
  }

  // string representations (ObjectId("..."), new ObjectId("..."), raw hex)
  if (typeof x === 'string') {
    const m = x.match(
      /new\s+ObjectId\(["']([0-9a-fA-F]{24})["']\)|ObjectId\(["']([0-9a-fA-F]{24})["']\)|([0-9a-fA-F]{24})/
    );
    const hex = (m && (m[1] || m[2] || m[3])) ? (m[1] || m[2] || m[3]) : null;
    if (hex && mongoose.isValidObjectId(hex)) return String(hex);
  }

  return undefined;
}

// check if User model has organization field
const userHasOrgField = () => Boolean(User?.schema?.path?.('organization'));

/* -------------------------- Org resolution (admin) ------------------------ */

// find org for admin → by query orgId or by staff/createdBy
async function resolveAdminOrg({ adminUserId, orgIdFromQuery }) {
  if (!adminUserId) {
    const e = new Error('resolveAdminOrg: adminUserId is required');
    e.status = 400;
    throw e;
  }

  // if orgId is explicitly passed
  if (orgIdFromQuery) {
    const id = toId(orgIdFromQuery);
    const org = id ? await Organization.findById(id) : null;
    if (!org) {
      const e = new Error('Organization not found by orgId');
      e.status = 404;
      throw e;
    }
    return org;
  }

  // fallback → find org where admin is creator or staff
  const org = await Organization.findOne({
    $or: [{ createdBy: adminUserId }, { staff: adminUserId }],
  });

  if (!org) {
    const e = new Error('Organization not found for admin');
    e.status = 404;
    throw e;
  }
  return org;
}

// flexible wrapper for resolveAdminOrg
async function findAdminOrg(arg1, arg2) {
  if (arg1 && arg1.user && arg1.query) {
    return resolveAdminOrg({
      adminUserId: arg1.user._id,
      orgIdFromQuery: arg1.query.orgId,
    });
  }
  if (arg1 && typeof arg1 === 'object' && (arg1.adminUserId || arg1.orgIdFromQuery)) {
    return resolveAdminOrg(arg1);
  }
  if (arg1) {
    return resolveAdminOrg({ adminUserId: arg1, orgIdFromQuery: arg2 });
  }
  const e = new Error('findAdminOrg: invalid arguments');
  e.status = 400;
  throw e;
}

/* ----------------------------- Org assertions ----------------------------- */

// check if user belongs to org
function assertSameOrg(orgDoc, userDoc) {
  if (!orgDoc || !userDoc) return false;
  const orgId = toId(orgDoc);
  const userOrgId = toId(userDoc.organization);
  return idsEqual(orgId, userOrgId);
}

// check if user is in org.staff list
function isUserInOrg(userDoc, orgDoc) {
  if (!userDoc || !orgDoc) return false;
  const userId = toId(userDoc);
  return Array.isArray(orgDoc.staff) && orgDoc.staff.some((id) => idsEqual(id, userId));
}

// if caretaker has no org → link them to this org
async function linkCaretakerToOrgIfFreelance(caretakerDoc, orgDoc) {
  if (!caretakerDoc) {
    const e = new Error('linkCaretakerToOrgIfFreelance: caretaker is required');
    e.status = 400;
    throw e;
  }
  if (!orgDoc) {
    const e = new Error('linkCaretakerToOrgIfFreelance: org is required');
    e.status = 400;
    throw e;
  }

  if (!userHasOrgField()) {
    return { linked: false, alreadyInOrg: false, movedFromOtherOrg: false };
  }

  const orgId = toId(orgDoc);
  const currentOrgId = toId(caretakerDoc.organization);

  // freelance caretaker → assign org
  if (!currentOrgId) {
    await User.updateOne({ _id: caretakerDoc._id }, { $set: { organization: orgId } });
    return { linked: true, alreadyInOrg: false, movedFromOtherOrg: false };
  }

  // already in same org
  if (idsEqual(currentOrgId, orgId)) {
    return { linked: false, alreadyInOrg: true, movedFromOtherOrg: false };
  }

  // caretaker already belongs elsewhere
  return { linked: false, alreadyInOrg: false, movedFromOtherOrg: true };
}

/* ------------------------- Staff add/remove helpers ------------------------ */

// add nurse/doctor to org staff
async function addUserToOrgStaff(orgArg, userArg) {
  const orgId = toId(orgArg);
  const userId = toId(userArg);
  if (!orgId || !userId) {
    const e = new Error('addUserToOrgStaff: orgId and userId are required');
    e.status = 400;
    throw e;
  }

  const org = await Organization.findById(orgId);
  if (!org) {
    const e = new Error('Organization not found');
    e.status = 404;
    throw e;
  }
  if (org.active === false) {
    const e = new Error('Organization is inactive');
    e.status = 400;
    throw e;
  }

  const updatedOrg = await Organization.findByIdAndUpdate(
    orgId,
    { $addToSet: { staff: userId }, $set: { updated_at: Date.now() } },
    { new: true }
  );

  // sync user.organization if missing/mismatched
  if (userHasOrgField()) {
    const u = await User.findById(userId).select('organization');
    if (u && !idsEqual(u.organization, orgId)) {
      u.organization = orgId;
      await u.save();
    }
  }

  return updatedOrg;
}

// remove nurse/doctor from org staff
async function removeUserFromOrgStaff(orgArg, userArg) {
  const orgId = toId(orgArg);
  const userId = toId(userArg);
  if (!orgId || !userId) {
    const e = new Error('removeUserFromOrgStaff: orgId and userId are required');
    e.status = 400;
    throw e;
  }

  const updatedOrg = await Organization.findByIdAndUpdate(
    orgId,
    { $pull: { staff: userId }, $set: { updated_at: Date.now() } },
    { new: true }
  );
  if (!updatedOrg) {
    const e = new Error('Organization not found');
    e.status = 404;
    throw e;
  }

  // unlink user.organization if it matches
  if (userHasOrgField()) {
    const u = await User.findById(userId).select('organization');
    if (u && idsEqual(u.organization, orgId)) {
      u.organization = undefined;
      await u.save();
    }
  }

  return updatedOrg;
}

module.exports = {
  resolveAdminOrg,
  findAdminOrg,
  assertSameOrg,
  isUserInOrg,
  linkCaretakerToOrgIfFreelance,
  addUserToOrgStaff,
  removeUserFromOrgStaff,
  toId,
};
