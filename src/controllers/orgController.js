'use strict';

const Organization = require('../models/Organization');

/**
 * @swagger
 * tags:
 *   - name: Organization
 *     description: Endpoints for creating and listing organizations (admin only)
 */

/* ---------------------------------------------------------------------- */
/**
 * @swagger
 * /api/v1/orgs:
 *   post:
 *     summary: Create a new organization
 *     description: Admins can spin up a fresh org. The creator becomes the `createdBy` and is auto-added into `staff`.
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
 *                 minLength: 1
 *                 example: Guardian Health Org
 *               description:
 *                 type: string
 *                 nullable: true
 *                 default: ""
 *                 example: Primary org for testing
 *               active:
 *                 type: boolean
 *                 default: true
 *                 example: true
 *     responses:
 *       201:
 *         description: Organization created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [message, org]
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Organization created
 *                 org:
 *                   type: object
 *                   required: [_id, name, active, createdBy, staff]
 *                   properties:
 *                     _id:
 *                       type: string
 *                       description: MongoDB ObjectId of the organization
 *                       example: 66ef5c2a9f3a1d0012ab34cd
 *                     name:
 *                       type: string
 *                       example: Guardian Health Org
 *                     description:
 *                       type: string
 *                       nullable: true
 *                       example: Primary org for testing
 *                     active:
 *                       type: boolean
 *                       example: true
 *                     createdBy:
 *                       type: string
 *                       description: User ID of the creator (admin)
 *                       example: 66ef5b7d9f3a1d0012ab34aa
 *                     staff:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: ["66ef5b7d9f3a1d0012ab34aa"]
 *                     created_at:
 *                       type: string
 *                       format: date-time
 *                     updated_at:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Validation error or bad request
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [message]
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Error creating organization
 *                 details:
 *                   type: string
 *                   example: name is required
 *       401:
 *         description: Unauthorized (no/invalid token)
 */
exports.createOrg = async (req, res) => {
  try {
    const { name, description = '', active = true } = req.body || {};

    if (!req.user?._id) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ message: 'name is required' });
    }

    const normalizedName = name.trim();

    const exists = await Organization.findOne({ name: normalizedName }).lean();
    if (exists) {
      return res.status(400).json({ message: 'Organization with this name already exists' });
    }

    // creator auto-added to staff
    const org = await Organization.create({
      name: normalizedName,
      description,
      active: Boolean(active),
      createdBy: req.user._id,
      staff: [req.user._id],
    });

    res.status(201).json({ message: 'Organization created', org });
  } catch (err) {
    res.status(400).json({ message: 'Error creating organization', details: err.message });
  }
};

/* ---------------------------------------------------------------------- */
/**
 * @swagger
 * /api/v1/orgs/mine:
 *   get:
 *     summary: List my organizations
 *     description: Fetch all orgs where I’m either the creator or part of staff. Only works for admins.
 *     tags: [Organization]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Array of organizations I belong to
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [orgs]
 *               properties:
 *                 orgs:
 *                   type: array
 *                   items:
 *                     type: object
 *                     required: [_id, name, active, createdBy, staff]
 *                     properties:
 *                       _id:
 *                         type: string
 *                         example: 66ef5c2a9f3a1d0012ab34cd
 *                       name:
 *                         type: string
 *                         example: Guardian Health Org
 *                       description:
 *                         type: string
 *                         nullable: true
 *                         example: Primary org for testing
 *                       active:
 *                         type: boolean
 *                         example: true
 *                       createdBy:
 *                         type: string
 *                         example: 66ef5b7d9f3a1d0012ab34aa
 *                       staff:
 *                         type: array
 *                         items:
 *                           type: string
 *                         example: ["66ef5b7d9f3a1d0012ab34aa", "66ef5c7e9f3a1d0012ab34ee"]
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *                       updated_at:
 *                         type: string
 *                         format: date-time
 *       401:
 *         description: Unauthorized (no/invalid token)
 *       500:
 *         description: Error fetching orgs
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [message]
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Error fetching orgs
 *                 details:
 *                   type: string
 *                   example: Database connection failed
 */
exports.listMyOrgs = async (req, res) => {
  try {
    if (!req.user?._id) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const orgs = await Organization.find({
      $or: [{ createdBy: req.user._id }, { staff: req.user._id }],
    }).sort({ created_at: -1 });

    res.status(200).json({ orgs });
  } catch (err) {
    res.status(500).json({ message: 'Error fetching orgs', details: err.message });
  }
};
