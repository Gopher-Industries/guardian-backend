const express = require('express');
const router = express.Router();

const doctorLetterController = require('../controllers/doctorLetterController');
const verifyToken = require('../middleware/verifyToken');
const verifyRole = require('../middleware/verifyRole');

/**
 * @openapi
 * /api/v1/doctor-letters/pdf:
 *   post:
 *     tags:
 *       - Doctor Letters
 *     summary: Generate and save a doctor's letter PDF
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - patientId
 *               - doctorName
 *               - patientName
 *               - letterContent
 *             properties:
 *               patientId:
 *                 type: string
 *                 example: "6aa79c95748e39c41e050b45"
 *               doctorName:
 *                 type: string
 *                 example: "Dr John Doe"
 *               patientName:
 *                 type: string
 *                 example: "Test Patient"
 *               date:
 *                 type: string
 *                 example: "18/09/2026"
 *               subject:
 *                 type: string
 *                 example: "Medical Letter"
 *               letterContent:
 *                 type: string
 *                 example: "This letter confirms that the patient attended a medical appointment."
 *     responses:
 *       200:
 *         description: Doctor's letter generated and saved successfully
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *       400:
 *         description: Missing fields or invalid patient ID
 *       404:
 *         description: Patient not found
 *       500:
 *         description: Server error
 */
router.post(
  '/pdf',
  verifyToken,
  verifyRole('doctor'),
  doctorLetterController.generateDoctorLetter
);

module.exports = router;