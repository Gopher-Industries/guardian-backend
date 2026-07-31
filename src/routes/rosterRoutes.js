const express = require('express');

const router = express.Router();
const rosterController = require('../controllers/rosterController');
const verifyToken = require('../middleware/verifyToken');
const verifyRole = require('../middleware/verifyRole');

router.use(
  verifyToken,
  verifyRole(['admin', 'doctor', 'nurse', 'caretaker'])
);

/**
 * @swagger
 * tags:
 *   - name: Rosters
 *     description: Staff roster and shift management
 *
 * components:
 *   schemas:
 *     Roster:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           example: "66a774ac9054717d844f0091"
 *         shiftId:
 *           type: string
 *           example: "SHIFT-001"
 *         location:
 *           type: string
 *           example: "Guardian Care Centre"
 *         room:
 *           type: string
 *           example: "Room 12"
 *         description:
 *           type: string
 *           example: "Morning patient monitoring"
 *         generalNotes:
 *           type: string
 *           example: "Check medication and blood pressure."
 *         date:
 *           type: string
 *           format: date
 *           example: "2026-07-28"
 *         startTime:
 *           type: string
 *           example: "08:00"
 *         endTime:
 *           type: string
 *           example: "16:00"
 *         clockOnTime:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         clockOffTime:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         assignedStaff:
 *           type: string
 *           description: MongoDB ID of the assigned staff member
 *           example: "66a774ac9054717d844f0092"
 *         createdBy:
 *           type: string
 *           description: MongoDB ID of the admin who created the shift
 *
 *     RosterCreateRequest:
 *       type: object
 *       required:
 *         - shiftId
 *         - location
 *         - room
 *         - description
 *         - date
 *         - startTime
 *         - endTime
 *         - assignedStaffId
 *       properties:
 *         shiftId:
 *           type: string
 *           example: "SHIFT-001"
 *         location:
 *           type: string
 *           example: "Guardian Care Centre"
 *         room:
 *           type: string
 *           example: "Room 12"
 *         description:
 *           type: string
 *           example: "Morning patient monitoring"
 *         generalNotes:
 *           type: string
 *           example: "Check medication and blood pressure."
 *         date:
 *           type: string
 *           format: date
 *           example: "2026-07-28"
 *         startTime:
 *           type: string
 *           example: "08:00"
 *         endTime:
 *           type: string
 *           example: "16:00"
 *         assignedStaffId:
 *           type: string
 *           example: "66a774ac9054717d844f0092"
 */

/**
 * @swagger
 * /api/v1/rosters:
 *   post:
 *     summary: Create a roster shift
 *     description: Admin creates a new shift and assigns it to a staff member.
 *     tags: [Rosters]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RosterCreateRequest'
 *     responses:
 *       201:
 *         description: Roster shift created successfully
 *       400:
 *         description: Missing or invalid fields
 *       404:
 *         description: Staff member not found
 *       409:
 *         description: Shift ID already exists
 *       500:
 *         description: Server error
 */
router.post(
  '/',
  verifyRole('admin'),
  rosterController.createRoster
);

/**
 * @swagger
 * /api/v1/rosters:
 *   get:
 *     summary: Get roster shifts
 *     description: Admins see all shifts. Other staff members see their assigned shifts.
 *     tags: [Rosters]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: date
 *         schema:
 *           type: string
 *           format: date
 *         example: "2026-07-28"
 *       - in: query
 *         name: assignedStaffId
 *         schema:
 *           type: string
 *         description: Filter by assigned staff member
 *       - in: query
 *         name: location
 *         schema:
 *           type: string
 *         example: "Guardian Care Centre"
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: Roster shifts returned successfully
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Access denied
 *       500:
 *         description: Server error
 */
router.get('/', rosterController.getRosters);

/**
 * @swagger
 * /api/v1/rosters/{shiftId}/clock-on:
 *   patch:
 *     summary: Clock on for a shift
 *     description: Records the current time as the assigned staff member's clock-on time.
 *     tags: [Rosters]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: shiftId
 *         required: true
 *         schema:
 *           type: string
 *         example: "SHIFT-001"
 *     responses:
 *       200:
 *         description: Clocked on successfully
 *       400:
 *         description: Staff member has already clocked on
 *       403:
 *         description: User is not assigned to the shift
 *       404:
 *         description: Shift not found
 */
router.patch(
  '/:shiftId/clock-on',
  verifyRole(['doctor', 'nurse', 'caretaker']),
  rosterController.clockOn
);

/**
 * @swagger
 * /api/v1/rosters/{shiftId}/clock-off:
 *   patch:
 *     summary: Clock off from a shift
 *     description: Records the current time as the assigned staff member's clock-off time.
 *     tags: [Rosters]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: shiftId
 *         required: true
 *         schema:
 *           type: string
 *         example: "SHIFT-001"
 *     responses:
 *       200:
 *         description: Clocked off successfully
 *       400:
 *         description: Staff member has not clocked on or already clocked off
 *       403:
 *         description: User is not assigned to the shift
 *       404:
 *         description: Shift not found
 */
router.patch(
  '/:shiftId/clock-off',
  verifyRole(['doctor', 'nurse', 'caretaker']),
  rosterController.clockOff
);

/**
 * @swagger
 * /api/v1/rosters/{shiftId}:
 *   get:
 *     summary: Get one roster shift
 *     tags: [Rosters]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: shiftId
 *         required: true
 *         schema:
 *           type: string
 *         example: "SHIFT-001"
 *     responses:
 *       200:
 *         description: Roster shift returned successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Roster'
 *       403:
 *         description: Access denied
 *       404:
 *         description: Shift not found
 */
router.get('/:shiftId', rosterController.getRosterByShiftId);

/**
 * @swagger
 * /api/v1/rosters/{shiftId}:
 *   put:
 *     summary: Update a roster shift
 *     description: Admin updates an existing shift.
 *     tags: [Rosters]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: shiftId
 *         required: true
 *         schema:
 *           type: string
 *         example: "SHIFT-001"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               location:
 *                 type: string
 *                 example: "Guardian Care Centre"
 *               room:
 *                 type: string
 *                 example: "Room 14"
 *               description:
 *                 type: string
 *                 example: "Afternoon patient monitoring"
 *               generalNotes:
 *                 type: string
 *                 example: "Check medication before handover."
 *               date:
 *                 type: string
 *                 format: date
 *                 example: "2026-07-29"
 *               startTime:
 *                 type: string
 *                 example: "12:00"
 *               endTime:
 *                 type: string
 *                 example: "20:00"
 *               assignedStaffId:
 *                 type: string
 *                 example: "66a774ac9054717d844f0092"
 *     responses:
 *       200:
 *         description: Roster shift updated successfully
 *       400:
 *         description: Invalid request
 *       404:
 *         description: Shift or staff member not found
 */
router.put(
  '/:shiftId',
  verifyRole('admin'),
  rosterController.updateRoster
);

/**
 * @swagger
 * /api/v1/rosters/{shiftId}:
 *   delete:
 *     summary: Delete a roster shift
 *     tags: [Rosters]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: shiftId
 *         required: true
 *         schema:
 *           type: string
 *         example: "SHIFT-001"
 *     responses:
 *       200:
 *         description: Roster shift deleted successfully
 *       404:
 *         description: Shift not found
 */
router.delete(
  '/:shiftId',
  verifyRole('admin'),
  rosterController.deleteRoster
);

module.exports = router;