'use strict';

const Organization = require('../models/Organization');
const User = require('../models/User');

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

/* ---------------------------------------------------------------------- */
/**
 * @swagger
 * /api/v1/orgs/public:
 *   get:
 *     summary: Fetch active organizations for nurse and caretaker users
 *     description: Returns active organizations that freelance nurse and caretaker users can browse before sending a join request.
 *     tags: [Organization]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Active organizations fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 orgs:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       description:
 *                         type: string
 *                       active:
 *                         type: boolean
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *                       updated_at:
 *                         type: string
 *                         format: date-time
 *       500:
 *         description: Error fetching organizations
 */
exports.listActiveOrgs = async (req, res) => {
  try {
    const orgs = await Organization.find({ active: true })
      .select('name description active created_at updated_at')
      .sort({ name: 1 })
      .lean();

    return res.status(200).json({ orgs });
  } catch (err) {
    return res.status(500).json({
      message: 'Error fetching organizations',
      details: err.message
    });
  }
};


/* ---------------------------------------------------------------------- */
/**
 * @swagger
 * /api/v1/orgs/request-join:
 *   post:
 *     summary: Request to join an organization
 *     description: Allows a freelance nurse or caretaker to request joining an active organization. The request is stored in pending state for admin review.
 *     tags: [Organization]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - orgId
 *             properties:
 *               orgId:
 *                 type: string
 *                 description: Selected organization ID
 *     responses:
 *       200:
 *         description: Join request submitted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 user:
 *                   type: object
 *                   properties:
 *                     _id:
 *                       type: string
 *                     fullname:
 *                       type: string
 *                     email:
 *                       type: string
 *                     organization:
 *                       type: string
 *                     approvalStatus:
 *                       type: string
 *       400:
 *         description: Missing orgId or invalid request state
 *       403:
 *         description: Only nurse or caretaker can request to join an organization
 *       404:
 *         description: User not found or organization not found
 *       500:
 *         description: Error requesting organization join
 */
exports.requestToJoinOrg = async (req, res) => {
  try {
    const { orgId } = req.body;

    if (!orgId) {
      return res.status(400).json({ message: 'orgId is required' });
    }

    const org = await Organization.findById(orgId);
    if (!org || org.active === false) {
      return res.status(404).json({ message: 'Organization not found or inactive' });
    }

    const user = await User.findById(req.user._id).populate('role', 'name');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const roleName = user.role?.name?.toLowerCase();
    if (!['nurse', 'caretaker'].includes(roleName)) {
      return res.status(403).json({
        message: 'Only nurse or caretaker can request to join an organization'
      });
    }

    // prevent duplicate pending request for the same org
    if (
      user.organization &&
      String(user.organization) === String(org._id) &&
      user.approvalStatus === 'pending'
    ) {
      return res.status(400).json({
        message: 'Join request is already pending for this organization'
      });
    }

    // if already approved in the same org, no new request is needed
    if (
      user.organization &&
      String(user.organization) === String(org._id) &&
      user.approvalStatus === 'approved'
    ) {
      return res.status(400).json({
        message: 'User is already approved in this organization'
      });
    }

    // approved org members should not silently switch orgs themselves
    if (
      user.organization &&
      String(user.organization) !== String(org._id) &&
      user.approvalStatus === 'approved'
    ) {
      return res.status(400).json({
        message: 'User is already approved in another organization. Ask admin to deactivate first.'
      });
    }

    // move user from freelance/requesting state into pending org state
    user.organization = org._id;
    user.approvalStatus = 'pending';
    user.approvedBy = null;
    user.approvedAt = null;
    user.rejectedBy = null;
    user.rejectedAt = null;
    user.rejectionReason = '';
    user.deactivatedBy = null;
    user.deactivatedAt = null;

    await user.save();

    return res.status(200).json({
      message: `Join request sent to ${org.name} successfully`,
      user: {
        _id: user._id,
        fullname: user.fullname,
        email: user.email,
        organization: user.organization,
        approvalStatus: user.approvalStatus
      }
    });
  } catch (err) {
    return res.status(500).json({
      message: 'Error requesting organization join',
      details: err.message
    });
  }
};