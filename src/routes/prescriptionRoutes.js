// src/routes/prescriptionRoutes.js
'use strict';

const express = require('express');
const router = express.Router();

const prescriptionController = require('../controllers/prescriptionController');
const verifyToken = require('../middleware/verifyToken');
const verifyRole = require('../middleware/verifyRole');

/**
 * @swagger
 * components:
 *   schemas:
 *     PrescriptionItem:
 *       type: object
 *       required:
 *         - name
 *         - dose
 *         - frequency
 *         - durationDays
 *       properties:
 *         name:
 *           type: string
 *           description: Medicine name
 *           example: Amoxicillin
 *         dose:
 *           type: string
 *           description: Dosage info
 *           example: "500 mg"
 *         frequency:
 *           type: string
 *           description: How often to take it
 *           example: "twice daily"
 *         durationDays:
 *           type: integer
 *           description: Number of days
 *           example: 7
 *         quantity:
 *           type: integer
 *           description: Total tablets or capsules
 *           example: 14
 *         instructions:
 *           type: string
 *           description: Extra guidance
 *           example: "Take after food"
 *
 *     PrescriptionCreateRequest:
 *       type: object
 *       description: Create prescription request body
 *       required:
 *         - items
 *       properties:
 *         patientId:
 *           type: string
 *           description: Patient ObjectId, required if patientName is not provided
 *           example: "68c268a3097a71d5162ac23a"
 *         patientName:
 *           type: string
 *           description: Patient full name, required if patientId is not provided
 *           example: "Asha Patel"
 *         items:
 *           type: array
 *           minItems: 1
 *           items:
 *             $ref: '#/components/schemas/PrescriptionItem'
 *         notes:
 *           type: string
 *           description: Optional notes for the prescription
 *           example: "For acute sinusitis"
 *         medicationName:
 *           type: string
 *           example: "Amoxicillin"
 *         dose:
 *           type: string
 *           example: "500 mg"
 *         howMany:
 *           type: integer
 *           example: 2
 *         timesPerDay:
 *           type: integer
 *           example: 3
 *         timesOfDay:
 *           type: array
 *           items:
 *             type: string
 *           example: ["morning", "afternoon", "night"]
 *         comment:
 *           type: string
 *           example: "Take after food"
 *       oneOf:
 *         - required: [patientId]
 *         - required: [patientName]
 */


/**
 * @swagger
 * /api/v1/prescriptions:
 *   post:
 *     summary: Create a new prescription for a patient
 *     tags: [Prescription]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PrescriptionCreateRequest'
 *           examples:
 *             minimal:
 *               summary: Minimal valid body
 *               value:
 *                 patientId: "68c268a3097a71d5162ac23a"
 *                 items:
 *                   - name: "Amoxicillin"
 *                     dose: "500 mg"
 *                     frequency: "twice daily"
 *                     durationDays: 7
 *             full:
 *               summary: With optional fields
 *               value:
 *                 patientId: "68c268a3097a71d5162ac23a"
 *                 items:
 *                   - name: "Amoxicillin"
 *                     dose: "500 mg"
 *                     frequency: "twice daily"
 *                     durationDays: 7
 *                     quantity: 14
 *                     instructions: "Take after food"
 *                 notes: "For acute sinusitis"
 *                 medicationName: "Panadol"
 *                 dose: "500 mg"
 *                 howMany: 2
 *                 timesPerDay: 2
 *                 timesOfDay: ["morning", "night"]
 *                 comment: "Take after food"
 *     responses:
 *       201:
 *         description: Prescription created successfully
 *       400:
 *         description: Missing or invalid fields
 *       404:
 *         description: Patient not found
 *       500:
 *         description: Error creating prescription
 */
router.post(
  '/',
  verifyToken,
  verifyRole(['doctor', 'admin']),
  prescriptionController.createPrescription
);

/**
 * @swagger
 * /api/v1/prescriptions/{id}:
 *   get:
 *     summary: Get prescription by ID
 *     tags: [Prescription]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Prescription ID
 *     responses:
 *       200:
 *         description: Prescription fetched successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Access denied
 *       404:
 *         description: Prescription not found
 *       500:
 *         description: Error fetching prescription
 */
router.get(
  '/:id',
  verifyToken,
  prescriptionController.getPrescriptionById
);

/**
 * @swagger
 * /api/v1/prescriptions/{id}:
 *   patch:
 *     summary: Update prescription
 *     tags: [Prescription]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Prescription ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               items:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/PrescriptionItem'
 *               notes:
 *                 type: string
 *               status:
 *                 type: string
 *                 enum: [active, discontinued, completed]
 *               medicationName:
 *                 type: string
 *               dose:
 *                 type: string
 *               howMany:
 *                 type: integer
 *               timesPerDay:
 *                 type: integer
 *               timesOfDay:
 *                 type: array
 *                 items:
 *                   type: string
 *               comment:
 *                 type: string
 *     responses:
 *       200:
 *         description: Prescription updated successfully
 *       404:
 *         description: Prescription not found
 *       500:
 *         description: Error updating prescription
 */
router.patch(
  '/:id',
  verifyToken,
  verifyRole(['doctor', 'admin']),
  prescriptionController.updatePrescription
);

/**
 * @swagger
 * /api/v1/prescriptions/{id}/discontinue:
 *   post:
 *     summary: Discontinue a prescription
 *     tags: [Prescription]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Prescription ID
 *     responses:
 *       200:
 *         description: Prescription discontinued successfully
 *       404:
 *         description: Prescription not found
 *       500:
 *         description: Error discontinuing prescription
 */
router.post(
  '/:id/discontinue',
  verifyToken,
  verifyRole(['doctor', 'admin']),
  prescriptionController.discontinuePrescription
);

/**
 * @swagger
 * /api/v1/prescriptions/{id}:
 *   delete:
 *     summary: Delete prescription by ID
 *     tags: [Prescription]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Prescription ID
 *     responses:
 *       200:
 *         description: Prescription deleted successfully
 *       404:
 *         description: Prescription not found
 *       500:
 *         description: Error deleting prescription
 */
router.delete(
  '/:id',
  verifyToken,
  verifyRole(['doctor', 'admin']),
  prescriptionController.deletePrescription
);

module.exports = router;