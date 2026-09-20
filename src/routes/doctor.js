// src/routes/doctor.js
const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

const verifyToken = require('../middleware/verifyToken');
const verifyRole = require('../middleware/verifyRole');
const doctorController = require('../controllers/doctorController');
const specialistReportController = require('../controllers/specialistReportController');

// Optional: validate :doctorId early
router.param('doctorId', (req, res, next, id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: 'Invalid doctorId' });
  }
  next();
});

/**
 * @openapi
 * /api/v1/doctors:
 *   get:
 *     tags:
 *       - Doctor
 *     summary: Get all doctors
 *     description: >
 *       Returns a list of all doctors in the system.
 *       Supports optional search by name or email and pagination.
 *       **Roles:** All authenticated users (admin, caretaker, nurse, doctor).
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/SearchQuery'
 *       - $ref: '#/components/parameters/PageQuery'
 *       - $ref: '#/components/parameters/LimitQuery'
 *     responses:
 *       200:
 *         description: List of doctors returned successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 doctors:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/DoctorSummary'
 *                 total:
 *                   type: integer
 *                   example: 8
 *                 page:
 *                   type: integer
 *                   example: 1
 *                 limit:
 *                   type: integer
 *                   example: 10
 *             example:
 *               doctors:
 *                 - _id: "664f1c2e8b1a2c3d4e5f6a7d"
 *                   name: "Dr. Alan Grant"
 *                   email: "alan.grant@guardianmonitor.com"
 *                   specialization: "Geriatrics"
 *                   isActive: true
 *               total: 8
 *               page: 1
 *               limit: 10
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
// GET /api/v1/doctors -> list all doctors (supports ?search=&page=&limit=)
router.get('/', verifyToken, doctorController.listDoctors);

// Static /doctors/* routes must come before /:doctorId to avoid param capture
router.get('/profile', verifyToken, verifyRole(['doctor']), doctorController.getProfile);
router.put('/profile', verifyToken, verifyRole(['doctor']), doctorController.updateProfile);
router.get('/dashboard-summary', verifyToken, verifyRole(['doctor']), doctorController.getDashboardSummary);

/**
 * @openapi
 * /api/v1/doctors/specialist-reports:
 *   post:
 *     tags:
 *       - Specialist Reports
 *     summary: Create a specialist report
 *     description: >
 *       Auto-fetches specialist details from the logged-in doctor and
 *       patient details from the patient record. Consultation date,
 *       examination findings, and action items must be supplied manually.
 *       Any auto-fetched section can be overridden by including it
 *       explicitly in the request body.
 *       **Roles:** doctor.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [patientId, consultation]
 *             properties:
 *               patientId:
 *                 type: string
 *                 description: Patient this report is for.
 *               reasonForReferral:
 *                 type: string
 *               specialistClinic:
 *                 type: object
 *                 description: Optional overrides for auto-fetched specialist details.
 *               referringDoctor:
 *                 type: object
 *                 description: Optional overrides for auto-fetched referring doctor details.
 *               consultation:
 *                 type: object
 *                 required: [date]
 *                 properties:
 *                   date: { type: string, format: date }
 *                   history: { type: string }
 *                   currentMedications: { type: string }
 *                   allergies: { type: string }
 *               examination:
 *                 type: object
 *                 properties:
 *                   examinationsPerformed: { type: string }
 *                   findings: { type: string }
 *                   testResults: { type: string }
 *                   diagnosis: { type: string }
 *               managementPlan:
 *                 type: object
 *                 description: Optional overrides. recommendedTreatment auto-fetches from the patient's latest ManagementPlan if not supplied.
 *               actionItemsForGP:
 *                 type: object
 *                 properties:
 *                   actionsRequired: { type: string }
 *                   sharedCareChanges: { type: string }
 *               urgency:
 *                 type: string
 *                 enum: [routine, urgent]
 *     responses:
 *       201:
 *         description: Specialist report created
 *       400:
 *         description: patientId missing
 *       404:
 *         description: Patient or logged-in doctor not found
 */
router.post('/specialist-reports', verifyToken, verifyRole(['doctor']), specialistReportController.createReport);

/**
 * @openapi
 * /api/v1/doctors/specialist-reports:
 *   get:
 *     tags:
 *       - Specialist Reports
 *     summary: List specialist reports created by the logged-in doctor
 *     description: '**Roles:** doctor.'
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Array of specialist reports
 */
router.get('/specialist-reports', verifyToken, verifyRole(['doctor']), specialistReportController.getReports);

/**
 * @openapi
 * /api/v1/doctors/specialist-reports/{id}/pdf:
 *   get:
 *     tags:
 *       - Specialist Reports
 *     summary: Generate and download the PDF for a specialist report
 *     description: '**Roles:** doctor.'
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: PDF file
 *         content:
 *           application/pdf:
 *             schema: { type: string, format: binary }
 *       404:
 *         description: Report not found
 */
router.get('/specialist-reports/:id/pdf', verifyToken, verifyRole(['doctor']), specialistReportController.generateReportPdf);

/**
 * @openapi
 * /api/v1/doctors/{doctorId}/patients:
 *   get:
 *     tags:
 *       - Doctor
 *     summary: Get patients assigned to a doctor
 *     description: >
 *       Returns all patients currently assigned to the specified doctor.
 *       **Roles:** admin, caretaker, doctor.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/DoctorIdParam'
 *     responses:
 *       200:
 *         description: List of patients assigned to the doctor
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
 *       400:
 *         description: Invalid doctorId format
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
 *             example:
 *               error: "Invalid doctorId"
 *       401:
 *         description: Unauthorized — missing or invalid token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthorizedError'
 *       403:
 *         description: Forbidden — only admin, caretaker, or doctor can access
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ForbiddenError'
 *       404:
 *         description: Doctor not found
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
// GET /api/v1/doctors/:doctorId/patients -> patients assigned to a doctor
router.get(
  '/:doctorId/patients',
  verifyToken,
  verifyRole(['admin', 'caretaker', 'doctor']),
  doctorController.listPatientsByDoctor
);

module.exports = router;