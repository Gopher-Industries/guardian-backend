const express = require('express');
const router = express.Router();
const nurseController = require('../controllers/nurseController');
const verifyToken = require('../middleware/verifyToken');
const verifyRole = require('../middleware/verifyRole');

/**
 * @openapi
 * /api/v1/nurse/profile:
 *   get:
 *     tags:
 *       - Nurse
 *     summary: View nurse profile by ID or email
 *     description: >
 *       Returns the profile of a nurse. Can be queried by passing an `id` or `email`
 *       as a query parameter. If no query param is provided, returns the authenticated nurse's own profile.
 *       **Roles:** All authenticated users (admin, caretaker, nurse, doctor).
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: id
 *         required: false
 *         schema:
 *           type: string
 *         description: MongoDB ObjectId of the nurse (optional)
 *         example: "664f1c2e8b1a2c3d4e5f6a7c"
 *       - in: query
 *         name: email
 *         required: false
 *         schema:
 *           type: string
 *           format: email
 *         description: Email address of the nurse (optional)
 *         example: "emily.clark@guardianmonitor.com"
 *     responses:
 *       200:
 *         description: Nurse profile returned successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/NurseProfile'
 *             example:
 *               _id: "664f1c2e8b1a2c3d4e5f6a7c"
 *               name: "Nurse Emily Clark"
 *               email: "emily.clark@guardianmonitor.com"
 *               phone: "+61412345678"
 *               assignedPatients: []
 *       401:
 *         description: Unauthorized — missing or invalid token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthorizedError'
 *       404:
 *         description: Nurse not found
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
// profile
router.get('/profile', verifyToken, nurseController.getProfile);

/**
 * @openapi
 * /api/v1/nurse/all:
 *   get:
 *     tags:
 *       - Nurse
 *     summary: Get all nurses
 *     description: >
 *       Returns a list of all registered nurses in the system.
 *       **Roles:** All authenticated users (admin, caretaker, nurse, doctor).
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/SearchQuery'
 *       - $ref: '#/components/parameters/PageQuery'
 *       - $ref: '#/components/parameters/LimitQuery'
 *     responses:
 *       200:
 *         description: List of nurses returned successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/NurseProfile'
 *             example:
 *               - _id: "664f1c2e8b1a2c3d4e5f6a7c"
 *                 name: "Nurse Emily Clark"
 *                 email: "emily.clark@guardianmonitor.com"
 *                 phone: "+61412345678"
 *               - _id: "664f1c2e8b1a2c3d4e5f6a8c"
 *                 name: "Nurse James Wilson"
 *                 email: "james.wilson@guardianmonitor.com"
 *                 phone: "+61487654321"
 *       401:
 *         description: Unauthorized — missing or invalid token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthorizedError'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
// list all nurses (any authenticated user)
router.get('/all', verifyToken, nurseController.getAllNurses);

/**
 * @openapi
 * /api/v1/nurse/assigned-patients:
 *   get:
 *     tags:
 *       - Nurse
 *     summary: Get patients assigned to the logged-in nurse
 *     description: >
 *       Returns all patients currently assigned to the authenticated nurse.
 *       The nurse is identified from the JWT token — no query parameter needed.
 *       **Roles:** nurse only.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of patients assigned to this nurse
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/PatientSummary'
 *             example:
 *               - _id: "664f1c2e8b1a2c3d4e5f6a7b"
 *                 name: "Mary Jane"
 *                 age: 72
 *                 gender: "female"
 *                 condition: "Dementia - Stage 2"
 *                 isActive: true
 *               - _id: "664f1c2e8b1a2c3d4e5f6a9b"
 *                 name: "George Smith"
 *                 age: 80
 *                 gender: "male"
 *                 condition: "Parkinson's - Stage 1"
 *                 isActive: true
 *       401:
 *         description: Unauthorized — missing or invalid token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthorizedError'
 *       403:
 *         description: Forbidden — only nurses can access this endpoint
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
// nurse's own assigned patients
router.get(
  '/assigned-patients',
  verifyToken,
  verifyRole(['nurse']),
  nurseController.getAssignedPatientsForNurse
);

module.exports = router;
