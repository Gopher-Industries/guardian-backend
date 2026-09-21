const express = require('express');
const router = express.Router();

const verifyToken = require('../middleware/verifyToken');
const verifyRole = require('../middleware/verifyRole');
const orgController = require('../controllers/orgController');

// allow only logged-in admins on these routes
router.use(verifyToken, verifyRole(['admin']));

/**
 * @openapi
 * /api/v1/orgs:
 *   post:
 *     tags:
 *       - Organization
 *     summary: Create a new organization
 *     description: >
 *       Creates a new organization and links it to the authenticated admin.
 *       Each admin can manage one or more organizations.
 *       **Roles:** admin only.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/OrgCreateRequest'
 *           example:
 *             name: "Sunrise Care Facility"
 *             address: "45 Care Lane, Sydney NSW 2000"
 *             phone: "+61298765432"
 *             email: "admin@sunrise.com.au"
 *     responses:
 *       201:
 *         description: Organization created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/OrgSummary'
 *             example:
 *               _id: "664f1c2e8b1a2c3d4e5f6a7b"
 *               name: "Sunrise Care Facility"
 *               address: "45 Care Lane, Sydney NSW 2000"
 *               adminId: "664f1c2e8b1a2c3d4e5f6a7c"
 *               createdAt: "2025-05-10T08:30:00.000Z"
 *       400:
 *         description: Validation error — name is required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
 *             example:
 *               error: "Organization name is required."
 *       401:
 *         description: Unauthorized — missing or invalid token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthorizedError'
 *       403:
 *         description: Forbidden — admin only
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ForbiddenError'
 *       409:
 *         description: Organization with this name already exists
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               error: "An organization with this name already exists."
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
// create a new organization
router.post('/', orgController.createOrg);

/**
 * @openapi
 * /api/v1/orgs/mine:
 *   get:
 *     tags:
 *       - Organization
 *     summary: List my organizations
 *     description: >
 *       Returns all organizations created by or linked to the currently authenticated admin.
 *       **Roles:** admin only.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of organizations belonging to this admin
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/OrgSummary'
 *             example:
 *               - _id: "664f1c2e8b1a2c3d4e5f6a7b"
 *                 name: "Sunrise Care Facility"
 *                 address: "45 Care Lane, Sydney NSW 2000"
 *                 adminId: "664f1c2e8b1a2c3d4e5f6a7c"
 *                 createdAt: "2025-05-10T08:30:00.000Z"
 *               - _id: "664f1c2e8b1a2c3d4e5f6a8b"
 *                 name: "BlueSky Aged Care"
 *                 address: "10 Blue Rd, Melbourne VIC 3000"
 *                 adminId: "664f1c2e8b1a2c3d4e5f6a7c"
 *                 createdAt: "2025-06-01T10:00:00.000Z"
 *       401:
 *         description: Unauthorized — missing or invalid token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthorizedError'
 *       403:
 *         description: Forbidden — admin only
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ForbiddenError'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
// list all orgs created by or linked to this admin
router.get('/mine', orgController.listMyOrgs);

module.exports = router;
