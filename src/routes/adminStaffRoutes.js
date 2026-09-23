const express = require('express');
const router = express.Router();

const verifyToken = require('../middleware/verifyToken');
const verifyRole = require('../middleware/verifyRole');

const adminStaffController = require('../controllers/adminStaffController');

// allow only logged-in admins on these routes
router.use(verifyToken, verifyRole(['admin']));

/**
 * @openapi
 * /api/v1/admin/staff:
 *   get:
 *     tags:
 *       - Admin - Staff
 *     summary: List staff (nurses/doctors) for an admin org
 *     description: >
 *       Returns all active staff members (nurses and doctors) belonging to
 *       the admin's organization. Supports search and pagination.
 *       **Roles:** admin only.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/SearchQuery'
 *       - $ref: '#/components/parameters/PageQuery'
 *       - $ref: '#/components/parameters/LimitQuery'
 *       - in: query
 *         name: role
 *         required: false
 *         schema:
 *           type: string
 *           enum: [nurse, doctor]
 *         description: Filter staff by role
 *         example: "nurse"
 *     responses:
 *       200:
 *         description: List of staff members
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 staff:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/StaffSummary'
 *                 total:
 *                   type: integer
 *                   example: 15
 *                 page:
 *                   type: integer
 *                   example: 1
 *                 limit:
 *                   type: integer
 *                   example: 10
 *             example:
 *               staff:
 *                 - _id: "664f1c2e8b1a2c3d4e5f6a7b"
 *                   name: "Dr. Sarah Connor"
 *                   email: "sarah.connor@guardianmonitor.com"
 *                   role: "doctor"
 *                   isActive: true
 *                 - _id: "664f1c2e8b1a2c3d4e5f6a7c"
 *                   name: "Nurse Emily Clark"
 *                   email: "emily.clark@guardianmonitor.com"
 *                   role: "nurse"
 *                   isActive: true
 *               total: 15
 *               page: 1
 *               limit: 10
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
// list staff members (nurses/doctors) in org
router.get('/staff', adminStaffController.listStaff);

/**
 * @openapi
 * /api/v1/admin/staff:
 *   post:
 *     tags:
 *       - Admin - Staff
 *     summary: Add a nurse/doctor into the org staff
 *     description: >
 *       Adds an existing user (nurse or doctor) into the admin's organization staff.
 *       The user must already be registered in the system.
 *       **Roles:** admin only.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/StaffAddRequest'
 *           example:
 *             userId: "664f1c2e8b1a2c3d4e5f6a7b"
 *             role: "nurse"
 *     responses:
 *       201:
 *         description: Staff member added successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StaffSummary'
 *             example:
 *               _id: "664f1c2e8b1a2c3d4e5f6a7b"
 *               name: "Nurse Emily Clark"
 *               email: "emily.clark@guardianmonitor.com"
 *               role: "nurse"
 *               isActive: true
 *       400:
 *         description: Validation error — missing userId or invalid role
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
 *             example:
 *               error: "userId is required."
 *       401:
 *         description: Unauthorized
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
 *       404:
 *         description: User not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/NotFoundError'
 *       409:
 *         description: Staff member already exists in the organization
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               error: "This user is already a staff member of your organization."
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
// add nurse/doctor to org staff
router.post('/staff', adminStaffController.addStaff);

/**
 * @openapi
 * /api/v1/admin/staff/{id}/deactivate:
 *   put:
 *     tags:
 *       - Admin - Staff
 *     summary: Remove a nurse/doctor from org staff
 *     description: >
 *       Deactivates a staff member (nurse or doctor) from the organization.
 *       This is a soft deactivation — the user account is not deleted.
 *       **Roles:** admin only.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/StaffIdParam'
 *     responses:
 *       200:
 *         description: Staff member deactivated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessMessage'
 *             example:
 *               message: "Staff member deactivated successfully."
 *       401:
 *         description: Unauthorized
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
 *       404:
 *         description: Staff member not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/NotFoundError'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
// remove nurse/doctor from org staff (deactivate)
router.put('/staff/:id/deactivate', adminStaffController.deactivateStaff);

module.exports = router;
