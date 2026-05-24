const express = require('express');
const router = express.Router();

const verifyToken = require('../middleware/verifyToken');
const verifyRole = require('../middleware/verifyRole');

const adminPatientController = require('../controllers/adminPatientController');

// allow only logged-in admins on these routes
router.use(verifyToken, verifyRole(['admin']));

/**
 * @openapi
 * /api/v1/admin/patients:
 *   post:
 *     tags:
 *       - AdminPatients
 *     summary: Create a new patient under caretaker's org
 *     description: >
 *       Creates a new patient and links them to a caretaker (required),
 *       and optionally a nurse and/or doctor — all within the admin's organization.
 *       **Roles:** admin only.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AdminPatientCreateRequest'
 *           example:
 *             name: "Robert Brown"
 *             age: 68
 *             gender: "male"
 *             caretakerId: "664f1c2e8b1a2c3d4e5f6a7b"
 *             nurseId: "664f1c2e8b1a2c3d4e5f6a7c"
 *             doctorId: "664f1c2e8b1a2c3d4e5f6a7d"
 *             condition: "Parkinson's - Early Stage"
 *     responses:
 *       201:
 *         description: Patient created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PatientSummary'
 *             example:
 *               _id: "664f1c2e8b1a2c3d4e5f6a7e"
 *               name: "Robert Brown"
 *               age: 68
 *               gender: "male"
 *               condition: "Parkinson's - Early Stage"
 *               isActive: true
 *       400:
 *         description: Validation error — missing required fields or invalid IDs
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
 *             example:
 *               error: "caretakerId is required."
 *       401:
 *         description: Unauthorized — missing or invalid token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthorizedError'
 *       403:
 *         description: Forbidden — only admins can access this endpoint
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ForbiddenError'
 *       404:
 *         description: Caretaker, nurse, or doctor not found
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
// create a new patient (caretaker required, nurse/doctor optional)
router.post('/patients', adminPatientController.createPatient);

/**
 * @openapi
 * /api/v1/admin/patients/{id}/assign:
 *   put:
 *     tags:
 *       - AdminPatients
 *     summary: Reassign caretaker, nurse, or doctor for a patient
 *     description: >
 *       Reassigns one or more care roles (caretaker, nurse, doctor) for an existing patient.
 *       Only provide the fields you want to change — all fields are optional.
 *       **Roles:** admin only.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AdminPatientReassignRequest'
 *           example:
 *             caretakerId: "664f1c2e8b1a2c3d4e5f6a7b"
 *             nurseId: "664f1c2e8b1a2c3d4e5f6a7c"
 *             doctorId: "664f1c2e8b1a2c3d4e5f6a7d"
 *     responses:
 *       200:
 *         description: Reassignment successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessMessage'
 *             example:
 *               message: "Patient reassigned successfully."
 *       400:
 *         description: Invalid request body or ID format
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
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
 *         description: Patient or referenced staff member not found
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
// reassign nurse / caretaker / doctor for a patient
router.put('/patients/:id/assign', adminPatientController.reassign);

/**
 * @openapi
 * /api/v1/admin/patients:
 *   get:
 *     tags:
 *       - AdminPatients
 *     summary: List patients for admin org
 *     description: >
 *       Returns a paginated list of patients belonging to the admin's organization.
 *       Supports search by name and filtering by active status.
 *       **Roles:** admin only.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/SearchQuery'
 *       - $ref: '#/components/parameters/PageQuery'
 *       - $ref: '#/components/parameters/LimitQuery'
 *       - in: query
 *         name: active
 *         required: false
 *         schema:
 *           type: boolean
 *           default: true
 *         description: Filter by active status (true = active only, false = deactivated)
 *         example: true
 *     responses:
 *       200:
 *         description: Paginated list of patients
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 patients:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/PatientSummary'
 *                 total:
 *                   type: integer
 *                   example: 42
 *                 page:
 *                   type: integer
 *                   example: 1
 *                 limit:
 *                   type: integer
 *                   example: 10
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
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
// list patients in org (with search + pagination + active filter)
router.get('/patients', adminPatientController.listPatients);

/**
 * @openapi
 * /api/v1/admin/patients/{id}/overview:
 *   get:
 *     tags:
 *       - AdminPatients
 *     summary: Get patient full overview (records, care plan, tasks, logs)
 *     description: >
 *       Returns a comprehensive overview of a specific patient including
 *       health records, care plan, assigned tasks, and activity logs.
 *       **Roles:** admin only.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     responses:
 *       200:
 *         description: Patient overview returned successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PatientOverview'
 *             example:
 *               patient:
 *                 _id: "664f1c2e8b1a2c3d4e5f6a7b"
 *                 name: "Mary Jane"
 *                 age: 72
 *                 gender: "female"
 *                 condition: "Dementia - Stage 2"
 *                 isActive: true
 *               records: []
 *               carePlan: {}
 *               tasks: []
 *               logs: []
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
 *         description: Patient not found
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
// get full overview of a patient (records, care plan, tasks, logs)
router.get('/patients/:id/overview', adminPatientController.patientOverview);

/**
 * @openapi
 * /api/v1/admin/patients/{id}:
 *   delete:
 *     tags:
 *       - AdminPatients
 *     summary: Deactivate a patient (soft delete)
 *     description: >
 *       Soft-deletes (deactivates) a patient record. The patient data is retained
 *       in the database but marked as inactive. This action does not permanently delete data.
 *       **Roles:** admin only.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     responses:
 *       200:
 *         description: Patient deactivated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessMessage'
 *             example:
 *               message: "Patient deactivated successfully."
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
 *         description: Patient not found
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
// soft delete / deactivate patient
router.delete('/patients/:id', adminPatientController.deactivatePatient);

module.exports = router;
