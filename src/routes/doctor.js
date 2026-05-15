// src/routes/doctor.js
const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

const verifyToken = require('../middleware/verifyToken');
const verifyRole = require('../middleware/verifyRole');
const doctorController = require('../controllers/doctorController');

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
