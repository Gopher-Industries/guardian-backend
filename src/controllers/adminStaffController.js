'use strict';

const mongoose = require('mongoose'); 
const User = require('../models/User');
const Role = require('../models/Role');
const { ensureUserWithRole } = require('../services/userService');
const { findAdminOrg, addUserToOrgStaff, removeUserFromOrgStaff } = require('../services/orgService');

/**
 * @swagger
 * tags:
 *   - name: AdminStaff
 *     description: Administrative endpoints for managing organization staff and approval workflows
 */

/* ---------------------------------------------------------------------- */
/**
 * @swagger
 * /api/v1/admin/staff:
 *   get:
 *     summary: List staff members for the admin's organization
 *     description: Returns a paginated list of staff members linked to the selected organization, with optional filtering by role and search keyword.
 *     tags: [AdminStaff]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: orgId
 *         required: false
 *         description: Optional organization ID when the admin manages multiple organizations
 *         schema:
 *           type: string
 *       - in: query
 *         name: role
 *         required: false
 *         description: Filter staff by role
 *         schema:
 *           type: string
 *           enum: [nurse, doctor]
 *       - in: query
 *         name: q
 *         required: false
 *         description: Search by full name or email address (case-insensitive)
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         required: false
 *         description: Page number
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *       - in: query
 *         name: limit
 *         required: false
 *         description: Number of records per page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 10
 *     responses:
 *       200:
 *         description: Staff list returned successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required:
 *                 - staff
 *                 - pagination
 *               properties:
 *                 staff:
 *                   type: array
 *                   items:
 *                     type: object
 *                     required:
 *                       - _id
 *                       - fullname
 *                       - email
 *                     properties:
 *                       _id:
 *                         type: string
 *                         example: "66ef5c2a9f3a1d0012ab34cd"
 *                       fullname:
 *                         type: string
 *                         example: "Ava Patel"
 *                       email:
 *                         type: string
 *                         example: "ava@example.com"
 *                       role:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                             example: "66ef5c2a9f3a1d0012ab34aa"
 *                           name:
 *                             type: string
 *                             example: "nurse"
 *                       organization:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                             example: "66ef5c2a9f3a1d0012ab34bb"
 *                           name:
 *                             type: string
 *                             example: "Guardian Health Org"
 *                 pagination:
 *                   type: object
 *                   required:
 *                     - total
 *                     - page
 *                     - pages
 *                     - limit
 *                   properties:
 *                     total:
 *                       type: integer
 *                       example: 42
 *                     page:
 *                       type: integer
 *                       example: 1
 *                     pages:
 *                       type: integer
 *                       example: 5
 *                     limit:
 *                       type: integer
 *                       example: 10
 *       404:
 *         description: Organization not found for the authenticated admin
 *       500:
 *         description: Internal server error while retrieving staff
 */
exports.listStaff = async (req, res) => {
  try {
    const { orgId, role, q, page = 1, limit = 10 } = req.query;
    const org = await findAdminOrg(req.user._id, orgId);
    if (!org) return res.status(404).json({ message: 'Organization not found for admin' });

    const p = parseInt(page, 10);
    const l = Math.min(100, parseInt(limit, 10));

    const baseFilter = { _id: { $in: org.staff } };

    if (q) {
      baseFilter.$or = [
        { fullname: new RegExp(q, 'i') },
        { email: new RegExp(q, 'i') }
      ];
    }

    let roleFilter = {};
    if (role) {
      const roleDoc = await Role.findOne({ name: role.toLowerCase() }).lean();
      if (roleDoc) roleFilter.role = roleDoc._id;
      else {
        return res.status(200).json({
          staff: [],
          pagination: { total: 0, page: p, pages: 0, limit: l }
        });
      }
    }

    const filter = { ...baseFilter, ...roleFilter };

    const [staff, total] = await Promise.all([
      User.find(filter)
        .select('-password_hash -__v')
        .populate('role', 'name')
        .populate('organization', 'name')
        .sort({ fullname: 1 })
        .skip((p - 1) * l)
        .limit(l)
        .lean(),
      User.countDocuments(filter)
    ]);

    res.status(200).json({
      staff,
      pagination: { total, page: p, pages: Math.ceil(total / l), limit: l }
    });
  } catch (err) {
    res.status(500).json({ message: 'Error listing staff', details: err.message });
  }
};

/* ---------------------------------------------------------------------- */
/**
 * @swagger
 * /api/v1/admin/staff:
 *   post:
 *     summary: Add a nurse or doctor to the organization staff
 *     description: Adds an existing user with role `nurse` or `doctor` to the staff list of the admin's organization.
 *     tags: [AdminStaff]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: orgId
 *         required: false
 *         description: Optional organization ID when the admin manages multiple organizations
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *             properties:
 *               userId:
 *                 type: string
 *                 description: User ID of an existing nurse or doctor
 *                 example: "66ef5c2a9f3a1d0012ab34dd"
 *     responses:
 *       200:
 *         description: Staff member added successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required:
 *                 - message
 *                 - organization
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Staff member added"
 *                 organization:
 *                   type: object
 *                   properties:
 *                     _id:
 *                       type: string
 *                       example: "66ef5c2a9f3a1d0012ab34bb"
 *                     name:
 *                       type: string
 *                       example: "Guardian Health Org"
 *                     active:
 *                       type: boolean
 *                       example: true
 *                     staff:
 *                       type: array
 *                       description: List of user IDs currently linked as staff
 *                       items:
 *                         type: string
 *       400:
 *         description: Invalid payload or the user does not have role nurse or doctor
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required:
 *                 - message
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "User must have role nurse or doctor"
 *       404:
 *         description: Organization not found for admin
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required:
 *                 - message
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Organization not found for admin"
 *       500:
 *         description: Internal server error while adding staff
 */
exports.addStaff = async (req, res) => {
  try {
    const { orgId } = req.query;
    const { userId } = req.body;

    const org = await findAdminOrg(req.user._id, orgId);
    if (!org) return res.status(404).json({ message: 'Organization not found for admin' });

    // Only nurse or doctor accounts can be added through this endpoint
    const nurse = await ensureUserWithRole(userId, 'nurse');
    const doctor = nurse ? null : await ensureUserWithRole(userId, 'doctor');
    const user = nurse || doctor;

    if (!user) {
      return res.status(400).json({ message: 'User must have role nurse or doctor' });
    }

    const updatedOrg = await addUserToOrgStaff(org._id, user._id);

    res.status(200).json({ message: 'Staff member added', organization: updatedOrg });
  } catch (err) {
    res.status(500).json({ message: 'Error adding staff', details: err.message });
  }
};

/* ---------------------------------------------------------------------- */
/**
 * @swagger
 * /api/v1/admin/staff/{id}/deactivate:
 *   put:
 *     summary: Remove a nurse or doctor from organization staff
 *     description: Removes the selected nurse or doctor from the organization's active staff list.
 *     tags: [AdminStaff]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: orgId
 *         required: false
 *         description: Optional organization ID when the admin manages multiple organizations
 *         schema:
 *           type: string
 *       - in: path
 *         name: id
 *         required: true
 *         description: User ID of the nurse or doctor
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Staff member removed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required:
 *                 - message
 *                 - organization
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Staff member removed"
 *                 organization:
 *                   type: object
 *                   properties:
 *                     _id:
 *                       type: string
 *                       example: "66ef5c2a9f3a1d0012ab34bb"
 *                     name:
 *                       type: string
 *                       example: "Guardian Health Org"
 *                     active:
 *                       type: boolean
 *                       example: true
 *                     staff:
 *                       type: array
 *                       items:
 *                         type: string
 *       404:
 *         description: Organization or user not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required:
 *                 - message
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "User not found"
 *       500:
 *         description: Internal server error while removing staff
 */
exports.deactivateStaff = async (req, res) => {
  try {
    const { id } = req.params;
    const { orgId } = req.query;

    const org = await findAdminOrg(req.user._id, orgId);
    if (!org) return res.status(404).json({ message: 'Organization not found for admin' });

    const user = await User.findById(id).populate('role');
    if (!user) return res.status(404).json({ message: 'User not found' });

    const updatedOrg = await removeUserFromOrgStaff(org._id, user._id, user.organization);

    res.status(200).json({ message: 'Staff member removed', organization: updatedOrg });
  } catch (err) {
    res.status(500).json({ message: 'Error removing staff', details: err.message });
  }
};

/* ---------------------------------------------------------------------- */
/**
 * @swagger
 * /api/v1/admin/staff/pending:
 *   get:
 *     summary: Get pending nurse and caretaker registrations for the admin's organization
 *     description: Returns all nurse and caretaker accounts in the selected organization that are awaiting admin approval.
 *     tags: [AdminStaff]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: orgId
 *         required: false
 *         schema:
 *           type: string
 *         description: Optional organization ID when the admin manages multiple organizations
 *     responses:
 *       200:
 *         description: Pending staff registrations returned successfully
 *       404:
 *         description: Organization not found for the authenticated admin
 *       500:
 *         description: Internal server error while retrieving pending registrations
 */
exports.getPendingStaffRegistrations = async (req, res) => {
  try {
    const { orgId } = req.query;

    const org = await findAdminOrg(req.user._id, orgId);
    if (!org) {
      return res.status(404).json({ message: 'Organization not found for admin' });
    }

    const roles = await Role.find({ name: { $in: ['nurse', 'caretaker'] } }).lean();
    const roleIds = roles.map(role => role._id);

    const pendingUsers = await User.find({
      role: { $in: roleIds },
      organization: org._id,
      approvalStatus: 'pending'
    })
      .select('-password_hash -__v')
      .populate('role', 'name')
      .populate('organization', 'name')
      .sort({ created_at: -1 })
      .lean();

    res.status(200).json({
      organization: { _id: org._id, name: org.name },
      total: pendingUsers.length,
      pendingUsers
    });
  } catch (error) {
    res.status(500).json({
      message: 'Error fetching pending staff registrations',
      details: error.message
    });
  }
};

/* ---------------------------------------------------------------------- */
/**
 * @swagger
 * /api/v1/admin/staff/{id}/approve:
 *   patch:
 *     summary: Approve a pending nurse or caretaker account
 *     description: Approves a pending nurse or caretaker account belonging to the admin's organization and adds the approved user to the organization staff list.
 *     tags: [AdminStaff]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Staff user ID
 *         schema:
 *           type: string
 *       - in: query
 *         name: orgId
 *         required: false
 *         schema:
 *           type: string
 *         description: Optional organization ID when the admin manages multiple organizations
 *     responses:
 *       200:
 *         description: Staff account approved successfully
 *       400:
 *         description: Invalid user ID or unsupported approval request
 *       403:
 *         description: User does not belong to the selected organization
 *       404:
 *         description: User or organization not found
 *       500:
 *         description: Internal server error while approving the staff account
 */
exports.approveStaff = async (req, res) => {
  try {
    const { id } = req.params;
    const { orgId } = req.query;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid user id' });
    }

    const org = await findAdminOrg(req.user._id, orgId);
    if (!org) {
      return res.status(404).json({ message: 'Organization not found for admin' });
    }

    const user = await User.findById(id).populate('role', 'name');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const roleName = user.role?.name?.toLowerCase();
    if (!['nurse', 'caretaker'].includes(roleName)) {
      return res.status(400).json({
        message: 'Only nurse or caretaker accounts can be approved'
      });
    }

    if (!user.organization || String(user.organization) !== String(org._id)) {
      return res.status(403).json({
        message: 'User does not belong to this organization'
      });
    }

    user.approvalStatus = 'approved';
    user.approvedBy = req.user._id;
    user.approvedAt = new Date();
    user.rejectedBy = null;
    user.rejectedAt = null;
    user.rejectionReason = '';
    user.deactivatedBy = null;
    user.deactivatedAt = null;

    await user.save();

    // Approved nurse and caretaker accounts are added to the organization's active staff list
    if (roleName === 'nurse' || roleName === 'caretaker') {
      await addUserToOrgStaff(org._id, user._id);
    }

    res.status(200).json({
      message: `${roleName} request approved successfully`,
      user: {
        _id: user._id,
        fullname: user.fullname,
        email: user.email,
        organization: user.organization,
        approvalStatus: user.approvalStatus
      }
    });
  } catch (error) {
    res.status(500).json({
      message: 'Error approving staff request',
      details: error.message
    });
  }
};

/* ---------------------------------------------------------------------- */
/**
 * @swagger
 * /api/v1/admin/staff/{id}/status:
 *   put:
 *     summary: Reject or deactivate a nurse or caretaker account
 *     description: Updates the status of a nurse or caretaker account in the admin's organization by rejecting a pending request or deactivating an existing member.
 *     tags: [AdminStaff]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: User ID of the staff account
 *         schema:
 *           type: string
 *       - in: query
 *         name: orgId
 *         required: false
 *         description: Optional organization ID when the admin manages multiple organizations
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - action
 *             properties:
 *               action:
 *                 type: string
 *                 enum: [reject, deactivate]
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Staff account status updated successfully
 *       400:
 *         description: Invalid user ID, invalid action, or unsupported role
 *       403:
 *         description: User does not belong to the selected organization
 *       404:
 *         description: User or organization not found
 *       500:
 *         description: Internal server error while updating staff status
 */
exports.rejectOrDeactivateStaff = async (req, res) => {
  try {
    const { id } = req.params;
    const { orgId } = req.query;
    const { action, reason } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid user id' });
    }

    if (!['reject', 'deactivate'].includes(action)) {
      return res.status(400).json({
        message: 'action must be either "reject" or "deactivate"'
      });
    }

    const org = await findAdminOrg(req.user._id, orgId);
    if (!org) {
      return res.status(404).json({ message: 'Organization not found for admin' });
    }

    const user = await User.findById(id).populate('role', 'name');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const roleName = user.role?.name?.toLowerCase();
    if (!['nurse', 'caretaker'].includes(roleName)) {
      return res.status(400).json({
        message: 'Only nurse or caretaker accounts can be updated'
      });
    }

    if (!user.organization || String(user.organization) !== String(org._id)) {
      return res.status(403).json({
        message: 'User does not belong to this organization'
      });
    }

    if (action === 'reject') {
      user.approvalStatus = 'rejected';
      user.rejectedBy = req.user._id;
      user.rejectedAt = new Date();
      user.rejectionReason = reason || '';
      user.approvedBy = null;
      user.approvedAt = null;
    }

    if (action === 'deactivate') {
      user.approvalStatus = 'deactivated';
      user.deactivatedBy = req.user._id;
      user.deactivatedAt = new Date();

      // Deactivated nurses are removed from the active organization staff list
      if (roleName === 'nurse') {
        await removeUserFromOrgStaff(org._id, user._id);
      }
    }

    await user.save();

    res.status(200).json({
      message: `${roleName} account ${action}ed successfully`,
      user: {
        _id: user._id,
        fullname: user.fullname,
        email: user.email,
        organization: user.organization,
        approvalStatus: user.approvalStatus
      }
    });
  } catch (error) {
    res.status(500).json({
      message: 'Error updating staff approval status',
      details: error.message
    });
  }
};