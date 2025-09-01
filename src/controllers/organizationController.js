const mongoose = require('mongoose');
const {
  Types: { ObjectId },
} = mongoose;

const Organization = require('../models/Organization');
const User = require('../models/User');

const mustBeObjectId = (id, label) => {
  if (!ObjectId.isValid(id)) {
    const e = new Error(`${label} must be a valid ObjectId`);
    e.status = 400;
    throw e;
  }
};

const roleOf = (user) => user?.role?.name?.toLowerCase();

/**
 * @swagger
 * tags:
 *   name: Organization
 *   description: Organization setup & roster management
 */

/**
 * @swagger
 * /api/v1/orgs/create:
 *   post:
 *     summary: Create an organization (admin only)
 *     description: Creates a new organization, sets the caller as the org admin, and joins them to the org (approved & active).
 *     tags: [Organization]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:
 *                 type: string
 *                 example: Sunrise Home Care
 *     responses:
 *       201:
 *         description: Organization created.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *                 organization:
 *                   type: object
 *                   properties:
 *                     _id: { type: string }
 *                     name: { type: string }
 *       400: { description: Bad request or already in an organization }
 *       401: { description: Unauthorized }
 *       403: { description: Forbidden (only admins) }
 *       409: { description: Organization name already exists }
 */
const createOrganization = async (req, res) => {
  try {
    const { me, roleName, isOrgMember } = req.ctx || {};
    if (!me) return res.status(401).json({ message: 'Unauthorized' });
    if (roleName !== 'admin') {
      return res.status(403).json({ message: 'Only admins can create organizations' });
    }
    if (isOrgMember) {
      return res.status(400).json({ message: 'You already belong to an organization' });
    }

    const { name } = req.body || {};
    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: 'Organization name is required' });
    }

    const exists = await Organization.findOne({ name: String(name).trim() });
    if (exists) {
      return res.status(409).json({ message: 'Organization name already exists' });
    }

    const org = await Organization.create({ name: String(name).trim(), admin: me._id });

    // Join admin to org (approved/active)
    await User.updateOne(
      { _id: me._id },
      { $set: { organization: org._id, isApproved: true, isActive: true } }
    );

    res.status(201).json({
      message: 'Organization created',
      organization: { _id: org._id, name: org.name },
    });
  } catch (err) {
    const status = err.status || (String(err?.code) === '11000' ? 409 : 400);
    res.status(status).json({ message: 'Error creating organization', details: err.message });
  }
};

/**
 * @swagger
 * /api/v1/orgs/add-member:
 *   post:
 *     summary: Add a nurse/caretaker to my organization (admin only)
 *     description: Adds a user as a member of your organization and marks them approved/active.
 *     tags: [Organization]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId]
 *             properties:
 *               userId:
 *                 type: string
 *                 example: 665f7f6c9c1e8d2b7a3a0c11
 *     responses:
 *       200:
 *         description: Member added.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *                 member:
 *                   type: object
 *                   properties:
 *                     _id: { type: string }
 *                     fullname: { type: string }
 *                     email: { type: string }
 *                     organization: { type: string, nullable: true }
 *                     isApproved: { type: boolean }
 *                     isActive: { type: boolean }
 *                     role:
 *                       type: object
 *                       properties:
 *                         name: { type: string }
 *       400: { description: Bad request or user already in another org }
 *       401: { description: Unauthorized }
 *       403: { description: Forbidden (only org admin) }
 *       404: { description: User not found }
 */
const addMember = async (req, res) => {
  try {
    const { me, roleName, isOrgMember, orgId } = req.ctx || {};
    if (!me) return res.status(401).json({ message: 'Unauthorized' });
    if (!isOrgMember || roleName !== 'admin') {
      return res.status(403).json({ message: 'Only org admin can add members' });
    }

    const { userId } = req.body || {};
    mustBeObjectId(userId, 'userId');

    const user = await User.findById(userId).populate('role');
    if (!user) return res.status(404).json({ message: 'User not found' });

    const r = roleOf(user);
    if (!['nurse', 'caretaker'].includes(r)) {
      return res.status(400).json({ message: 'Only nurse or caretaker can be added as a member' });
    }

    if (user.organization && String(user.organization) !== String(orgId)) {
      return res.status(400).json({ message: 'User already belongs to a different organization' });
    }

    // join & approve
    await User.updateOne(
      { _id: user._id },
      { $set: { organization: orgId, isApproved: true, isActive: true } }
    );

    const field = r === 'nurse' ? 'nurses' : 'caretakers';
    await Organization.updateOne({ _id: orgId }, { $addToSet: { [field]: user._id } });

    const member = await User.findById(user._id)
      .select('_id fullname email organization isApproved isActive')
      .populate('role', 'name');

    res.json({ message: 'Member added', member });
  } catch (err) {
    const status = err.status || 400;
    res.status(status).json({ message: 'Error adding member', details: err.message });
  }
};

/**
 * @swagger
 * /api/v1/orgs/member-status:
 *   patch:
 *     summary: Update member approval/active flags (admin only)
 *     description: Toggles `isApproved` and/or `isActive` for a user who belongs to your organization.
 *     tags: [Organization]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId]
 *             properties:
 *               userId:
 *                 type: string
 *               isApproved:
 *                 type: boolean
 *               isActive:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Member status updated.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *                 member:
 *                   type: object
 *                   properties:
 *                     _id: { type: string }
 *                     fullname: { type: string }
 *                     email: { type: string }
 *                     organization: { type: string, nullable: true }
 *                     isApproved: { type: boolean }
 *                     isActive: { type: boolean }
 *                     role:
 *                       type: object
 *                       properties:
 *                         name: { type: string }
 *       400: { description: Bad request / user not in your org / no fields to update }
 *       401: { description: Unauthorized }
 *       403: { description: Forbidden (only org admin) }
 *       404: { description: User not found }
 */
const setMemberStatus = async (req, res) => {
  try {
    const { me, roleName, isOrgMember, orgId } = req.ctx || {};
    if (!me) return res.status(401).json({ message: 'Unauthorized' });
    if (!isOrgMember || roleName !== 'admin') {
      return res.status(403).json({ message: 'Only org admin can modify member status' });
    }

    const { userId, isApproved, isActive } = req.body || {};
    mustBeObjectId(userId, 'userId');

    const user = await User.findById(userId).populate('role');
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (String(user.organization) !== String(orgId)) {
      return res.status(400).json({ message: 'User does not belong to your organization' });
    }

    const update = {};
    if (typeof isApproved === 'boolean') update.isApproved = isApproved;
    if (typeof isActive === 'boolean') update.isActive = isActive;

    if (!Object.keys(update).length) {
      return res.status(400).json({ message: 'No fields to update' });
    }

    await User.updateOne({ _id: user._id }, { $set: update });

    const member = await User.findById(user._id)
      .select('_id fullname email organization isApproved isActive')
      .populate('role', 'name');

    res.json({ message: 'Member status updated', member });
  } catch (err) {
    const status = err.status || 400;
    res.status(status).json({ message: 'Error updating member status', details: err.message });
  }
};

/**
 * @swagger
 * /api/v1/orgs/remove-member:
 *   post:
 *     summary: Remove a member from my organization (admin only)
 *     description: Removes the user from the organization, sets `organization=null` and `isApproved=false`.
 *     tags: [Organization]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId]
 *             properties:
 *               userId:
 *                 type: string
 *     responses:
 *       200: { description: Member removed. }
 *       400: { description: Bad request / user not in your org }
 *       401: { description: Unauthorized }
 *       403: { description: Forbidden (only org admin) }
 *       404: { description: User not found }
 */
const removeMember = async (req, res) => {
  try {
    const { me, roleName, isOrgMember, orgId } = req.ctx || {};
    if (!me) return res.status(401).json({ message: 'Unauthorized' });
    if (!isOrgMember || roleName !== 'admin') {
      return res.status(403).json({ message: 'Only org admin can remove members' });
    }

    const { userId } = req.body || {};
    mustBeObjectId(userId, 'userId');

    const user = await User.findById(userId).populate('role');
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (String(user.organization) !== String(orgId)) {
      return res.status(400).json({ message: 'User does not belong to your organization' });
    }

    const r = roleOf(user);
    const field = r === 'nurse' ? 'nurses' : r === 'caretaker' ? 'caretakers' : null;

    await User.updateOne(
      { _id: user._id },
      { $set: { organization: null, isApproved: false }, $currentDate: { updated_at: true } }
    );
    if (field) {
      await Organization.updateOne({ _id: orgId }, { $pull: { [field]: user._id } });
    }

    res.json({ message: 'Member removed' });
  } catch (err) {
    const status = err.status || 400;
    res.status(status).json({ message: 'Error removing member', details: err.message });
  }
};

/**
 * @swagger
 * /api/v1/orgs/me:
 *   get:
 *     summary: Get my organization summary & roster
 *     description: Returns the org information for the current user, including counts and member lists.
 *     tags: [Organization]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Organization summary.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 _id: { type: string }
 *                 name: { type: string }
 *                 admin:
 *                   type: object
 *                   properties:
 *                     fullname: { type: string }
 *                     email: { type: string }
 *                 counts:
 *                   type: object
 *                   properties:
 *                     nurses: { type: number }
 *                     caretakers: { type: number }
 *                     patients: { type: number }
 *                 nurses:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       fullname: { type: string }
 *                       email: { type: string }
 *                       isApproved: { type: boolean }
 *                       isActive: { type: boolean }
 *                 caretakers:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       fullname: { type: string }
 *                       email: { type: string }
 *                       isApproved: { type: boolean }
 *                       isActive: { type: boolean }
 *                 patients:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       fullname: { type: string }
 *                       gender: { type: string }
 *                       dateOfBirth: { type: string, format: date }
 *       401: { description: Unauthorized }
 *       403: { description: Not in an organization }
 *       404: { description: Organization not found }
 */
const getMyOrg = async (req, res) => {
  try {
    const { me, isOrgMember, orgId } = req.ctx || {};
    if (!me) return res.status(401).json({ message: 'Unauthorized' });
    if (!isOrgMember) return res.status(403).json({ message: 'Not in an organization' });

    const org = await Organization.findById(orgId)
      .populate('admin', 'fullname email')
      .populate('nurses', 'fullname email isApproved isActive')
      .populate('caretakers', 'fullname email isApproved isActive')
      .populate('patients', 'fullname gender dateOfBirth');

    if (!org) return res.status(404).json({ message: 'Organization not found' });

    const summary = {
      _id: org._id,
      name: org.name,
      admin: org.admin,
      counts: {
        nurses: org.nurses?.length || 0,
        caretakers: org.caretakers?.length || 0,
        patients: org.patients?.length || 0,
      },
      nurses: org.nurses || [],
      caretakers: org.caretakers || [],
      patients: org.patients || [],
    };

    res.json(summary);
  } catch (err) {
    res.status(400).json({ message: 'Error fetching organization', details: err.message });
  }
};

module.exports = {
  createOrganization,
  addMember,
  setMemberStatus,
  removeMember,
  getMyOrg,
};
