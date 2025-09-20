'use strict';

const mongoose = require('mongoose'); 
const User = require('../models/User');
const Role = require('../models/Role');
const { ensureUserWithRole } = require('../services/userService');
const { findAdminOrg, addUserToOrgStaff, removeUserFromOrgStaff } = require('../services/orgService');

/**
 * @swagger
 * tags:
 *   - name: Admin - Staff
 *     description: Admin — manage org staff (nurses/doctors)
 */

/* ---------------------------------------------------------------------- */
/**
 * @swagger
 * /api/v1/admin/staff:
 *   get:
 *     summary: List staff (nurses/doctors) for an admin org
 *     tags: [Admin - Staff]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: orgId
 *         required: false
 *         description: Organization context (if the admin manages multiple orgs)
 *         schema:
 *           type: string
 *       - in: query
 *         name: role
 *         required: false
 *         description: Only fetch staff of a certain role
 *         schema:
 *           type: string
 *           enum: [nurse, doctor]
 *       - in: query
 *         name: q
 *         required: false
 *         description: Search by fullname/email (case-insensitive)
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         required: false
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *       - in: query
 *         name: limit
 *         required: false
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 10
 *     responses:
 *       200:
 *         description: Paginated staff list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [staff, pagination]
 *               properties:
 *                 staff:
 *                   type: array
 *                   items:
 *                     type: object
 *                     required: [_id, fullname, email]
 *                     properties:
 *                       _id: { type: string, example: "66ef5c2a9f3a1d0012ab34cd" }
 *                       fullname: { type: string, example: "Ava Patel" }
 *                       email: { type: string, example: "ava@example.com" }
 *                       role:
 *                         type: object
 *                         properties:
 *                           _id: { type: string, example: "66ef5c2a9f3a1d0012ab34aa" }
 *                           name: { type: string, example: "nurse" }
 *                       organization:
 *                         type: object
 *                         properties:
 *                           _id: { type: string, example: "66ef5c2a9f3a1d0012ab34bb" }
 *                           name: { type: string, example: "Guardian Health Org" }
 *                 pagination:
 *                   type: object
 *                   required: [total, page, pages, limit]
 *                   properties:
 *                     total: { type: integer, example: 42 }
 *                     page: { type: integer, example: 1 }
 *                     pages: { type: integer, example: 5 }
 *                     limit: { type: integer, example: 10 }
 *       404:
 *         description: Organization not found for admin
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
        return res.status(200).json({ staff: [], pagination: { total: 0, page: p, pages: 0, limit: l } });
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
 *     summary: Add a nurse/doctor into the org staff
 *     description: The target user **must already exist** with role nurse or doctor.
 *     tags: [Admin - Staff]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: orgId
 *         required: false
 *         description: Organization context (if the admin manages multiple orgs)
 *         schema:
 *           type: string
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
 *                 description: ID of the user (must be nurse or doctor)
 *                 example: "66ef5c2a9f3a1d0012ab34dd"
 *     responses:
 *       200:
 *         description: Staff member successfully added
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [message, organization]
 *               properties:
 *                 message: { type: string, example: "Staff member added" }
 *                 organization:
 *                   type: object
 *                   properties:
 *                     _id: { type: string, example: "66ef5c2a9f3a1d0012ab34bb" }
 *                     name: { type: string, example: "Guardian Health Org" }
 *                     active: { type: boolean, example: true }
 *                     staff:
 *                       type: array
 *                       description: Array of user IDs in staff
 *                       items: { type: string }
 *       400:
 *         description: Invalid role or payload
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [message]
 *               properties:
 *                 message: { type: string, example: "User must have role nurse or doctor" }
 *       404:
 *         description: Org or user not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [message]
 *               properties:
 *                 message: { type: string, example: "Organization not found for admin" }
 */
exports.addStaff = async (req, res) => {
  try {
    const { orgId } = req.query;
    const { userId } = req.body;

    const org = await findAdminOrg(req.user._id, orgId);
    if (!org) return res.status(404).json({ message: 'Organization not found for admin' });

    // validate: only nurse or doctor allowed
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
 *     summary: Remove a nurse/doctor from org staff
 *     tags: [Admin - Staff]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: orgId
 *         required: false
 *         description: Organization context (if the admin manages multiple orgs)
 *         schema:
 *           type: string
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID (nurse/doctor)
 *     responses:
 *       200:
 *         description: Staff member removed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [message, organization]
 *               properties:
 *                 message: { type: string, example: "Staff member removed" }
 *                 organization:
 *                   type: object
 *                   properties:
 *                     _id: { type: string, example: "66ef5c2a9f3a1d0012ab34bb" }
 *                     name: { type: string, example: "Guardian Health Org" }
 *                     active: { type: boolean, example: true }
 *                     staff:
 *                       type: array
 *                       items: { type: string }
 *       404:
 *         description: Org or user not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [message]
 *               properties:
 *                 message: { type: string, example: "User not found" }
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
