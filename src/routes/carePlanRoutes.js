const express = require('express');
const router = express.Router();
const carePlanController = require('../controllers/carePlanController');
const verifyToken = require('../middleware/verifyToken');
const verifyRole = require('../middleware/verifyRole');

router.use(verifyToken, verifyRole(['admin', 'caretaker', 'nurse', 'doctor']));

/**
 * @swagger
 * tags:
 *   - name: Care Plans
 *     description: Care plan management endpoints
 *
 * components:
 *   schemas:
 *     CarePlan:
 *       type: object
 *       properties:
 *         _id: { type: string }
 *         title: { type: string }
 *         patient: { type: string }
 *         author: { type: string }
 *         caretaker: { type: string, nullable: true }
 *         nurse: { type: string, nullable: true }
 *         status:
 *           type: string
 *           enum: [active, inactive]
 *         tasks:
 *           type: array
 *           items: { type: string }
 *         approved_by: { type: string, nullable: true }
 *         approved_at: { type: string, format: date-time, nullable: true }
 *         effective_from: { type: string, format: date-time }
 *         effective_to: { type: string, format: date-time, nullable: true }
 *         next_review_date: { type: string, format: date-time, nullable: true }
 *         last_reviewed_date: { type: string, format: date-time, nullable: true }
 *         dietary_requirements: { type: string }
 *         client_consent_flag: { type: boolean }
 *         consent_date: { type: string, format: date-time, nullable: true }
 *         created_at: { type: string, format: date-time }
 *         updated_at: { type: string, format: date-time }
 */

/**
 * @swagger
 * /api/v1/care-plans:
 *   post:
 *     summary: Create a care plan
 *     tags: [Care Plans]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, patientId]
 *             properties:
 *               title: { type: string }
 *               patientId: { type: string }
 *               caretakerId:
 *                 type: string
 *                 description: Optional when the patient already has a caretaker.
 *               nurseId: { type: string, nullable: true }
 *               status:
 *                 type: string
 *                 enum: [active, inactive]
 *               tasks:
 *                 type: array
 *                 items: { type: string }
 *               approvedBy:
 *                 type: string
 *                 nullable: true
 *                 description: User ID of the staff member who signed off on the plan.
 *               approvedAt: { type: string, format: date-time, nullable: true }
 *               effectiveFrom:
 *                 type: string
 *                 format: date-time
 *                 description: When the plan comes into effect. Defaults to now if omitted.
 *               effectiveTo: { type: string, format: date-time, nullable: true }
 *               nextReviewDate: { type: string, format: date-time, nullable: true }
 *               lastReviewedDate: { type: string, format: date-time, nullable: true }
 *               dietaryRequirements:
 *                 type: string
 *                 description: Allergies, texture-modified diet, or other dietary notes.
 *               clientConsentFlag: { type: boolean }
 *               consentDate: { type: string, format: date-time, nullable: true }
 *     responses:
 *       201:
 *         description: Care plan created
 *       400:
 *         description: Invalid request body
 *       409:
 *         description: Patient already has an active care plan
 */
router.post('/', carePlanController.createCarePlan);

/**
 * @swagger
 * /api/v1/care-plans:
 *   get:
 *     summary: Get all care plans visible to the current user
 *     tags: [Care Plans]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: patientId
 *         schema: { type: string }
 *       - in: query
 *         name: authorId
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [active, inactive] }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Paged care plan list
 */
router.get('/', carePlanController.getAllCarePlans);

/**
 * @swagger
 * /api/v1/care-plans/patient/{patientId}:
 *   get:
 *     summary: Get care plans by patient
 *     tags: [Care Plans]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: patientId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Care plans for a patient
 */
router.get('/patient/:patientId', carePlanController.getCarePlanByPatient);

/**
 * @swagger
 * /api/v1/care-plans/{carePlanId}:
 *   get:
 *     summary: Get one care plan
 *     tags: [Care Plans]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: carePlanId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Care plan details
 */
router.get('/:carePlanId', carePlanController.getCarePlanById);

/**
 * @swagger
 * /api/v1/care-plans/{carePlanId}:
 *   put:
 *     summary: Update a care plan
 *     tags: [Care Plans]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: carePlanId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: false
 *       description: All fields optional. Only fields included in the body are updated.
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title: { type: string }
 *               patientId: { type: string }
 *               caretakerId: { type: string, nullable: true }
 *               nurseId: { type: string, nullable: true }
 *               status:
 *                 type: string
 *                 enum: [active, inactive]
 *               tasks:
 *                 type: array
 *                 items: { type: string }
 *               approvedBy: { type: string, nullable: true }
 *               approvedAt: { type: string, format: date-time, nullable: true }
 *               effectiveFrom: { type: string, format: date-time }
 *               effectiveTo: { type: string, format: date-time, nullable: true }
 *               nextReviewDate: { type: string, format: date-time, nullable: true }
 *               lastReviewedDate: { type: string, format: date-time, nullable: true }
 *               dietaryRequirements: { type: string }
 *               clientConsentFlag: { type: boolean }
 *               consentDate: { type: string, format: date-time, nullable: true }
 *     responses:
 *       200:
 *         description: Care plan updated
 *       409:
 *         description: Another active care plan already exists for the patient
 */
router.put('/:carePlanId', carePlanController.updateCarePlan);

/**
 * @swagger
 * /api/v1/care-plans/{carePlanId}:
 *   delete:
 *     summary: Delete a care plan
 *     tags: [Care Plans]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: carePlanId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Care plan deleted
 */
router.delete('/:carePlanId', carePlanController.deleteCarePlan);

module.exports = router;