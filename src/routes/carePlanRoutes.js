const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/verifyToken');
const verifyRole = require('../middleware/verifyRole');
const carePlanController = require('../controllers/carePlanController');

/**
 * @swagger
 * tags:
 *   - name: CarePlans
 *     description: >
 *       Care plan management. Design decisions: a patient may keep multiple historical care plans,
 *       but only one plan may have `status=active` at a time; `caretaker` is required; `nurse` is optional;
 *       `status` is explicit so the frontend can distinguish the active plan from inactive history.
 *
 * components:
 *   schemas:
 *     CarePlan:
 *       type: object
 *       required: [_id, title, patient, caretaker, status, tasks, created_at, updated_at]
 *       properties:
 *         _id: { type: string }
 *         title: { type: string }
 *         description: { type: string }
 *         patient:
 *           oneOf:
 *             - type: string
 *             - type: object
 *         caretaker:
 *           oneOf:
 *             - type: string
 *             - type: object
 *         nurse:
 *           nullable: true
 *           oneOf:
 *             - type: string
 *             - type: object
 *         status:
 *           type: string
 *           enum: [active, inactive]
 *           description: Only one active care plan may exist per patient.
 *         tasks:
 *           type: array
 *           items:
 *             oneOf:
 *               - type: string
 *               - type: object
 *         created_at: { type: string, format: date-time }
 *         updated_at: { type: string, format: date-time }
 *     CarePlanInput:
 *       type: object
 *       required: [title, patientId, caretakerId]
 *       properties:
 *         title: { type: string }
 *         description: { type: string }
 *         patientId:
 *           type: string
 *           description: Patient that owns the care plan.
 *         caretakerId:
 *           type: string
 *           description: Required caretaker user ID.
 *         nurseId:
 *           type: string
 *           nullable: true
 *           description: Optional nurse user ID. Patients may have a care plan before a nurse is assigned.
 *         tasks:
 *           type: array
 *           items: { type: string }
 *           description: Optional task IDs. Every task must exist and belong to the same patient.
 *     CarePlanUpdateInput:
 *       type: object
 *       properties:
 *         title: { type: string }
 *         description: { type: string }
 *         caretakerId: { type: string }
 *         nurseId:
 *           type: string
 *           nullable: true
 *           description: Use null to remove the nurse assignment.
 *         tasks:
 *           type: array
 *           items: { type: string }
 *         status:
 *           type: string
 *           enum: [active, inactive]
 *     CarePlanMutationResponse:
 *       type: object
 *       required: [message, carePlan]
 *       properties:
 *         message: { type: string }
 *         carePlan: { $ref: '#/components/schemas/CarePlan' }
 *     CarePlanListResponse:
 *       type: object
 *       required: [items, pagination]
 *       properties:
 *         items:
 *           type: array
 *           items: { $ref: '#/components/schemas/CarePlan' }
 *         pagination:
 *           type: object
 *           required: [total, page, pages, limit]
 *           properties:
 *             total: { type: integer }
 *             page: { type: integer }
 *             pages: { type: integer }
 *             limit: { type: integer }
 *     CarePlanDetailResponse:
 *       type: object
 *       required: [carePlan]
 *       properties:
 *         carePlan: { $ref: '#/components/schemas/CarePlan' }
 *     MessageResponse:
 *       type: object
 *       required: [message]
 *       properties:
 *         message: { type: string }
 *     ErrorResponse:
 *       type: object
 *       required: [message]
 *       properties:
 *         message: { type: string }
 *         details: { type: string }
 *         carePlanId: { type: string }
 */

/**
 * @swagger
 * /api/v1/care-plans:
 *   post:
 *     tags: [CarePlans]
 *     summary: Create a care plan
 *     description: >
 *       Creates a new active care plan. Only admins may create plans. If the patient already has an active plan,
 *       the API returns 409 instead of silently replacing it.
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/CarePlanInput' }
 *     responses:
 *       201:
 *         description: Care plan created
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/CarePlanMutationResponse' }
 *       400:
 *         description: Missing fields, invalid IDs, role mismatch, or tasks from another patient
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       401:
 *         description: Missing or invalid authentication token
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       403:
 *         description: Authenticated user is not an admin
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       404:
 *         description: Patient not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       409:
 *         description: Patient already has an active care plan
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       500:
 *         description: Error creating care plan
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.post('/', verifyToken, verifyRole(['admin']), carePlanController.createCarePlan);

/**
 * @swagger
 * /api/v1/care-plans:
 *   get:
 *     tags: [CarePlans]
 *     summary: List care plans
 *     description: >
 *       Returns active and inactive plans. Clinical users can read plans; use `status=active`
 *       when the frontend only needs the current plan.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: patientId
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [active, inactive] }
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
 *     responses:
 *       200:
 *         description: Paged care plan list
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/CarePlanListResponse' }
 *       400:
 *         description: Invalid filter values
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       401:
 *         description: Missing or invalid authentication token
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       403:
 *         description: Authenticated user lacks a clinical role
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       500:
 *         description: Error fetching care plans
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.get('/', verifyToken, verifyRole(['admin', 'caretaker', 'nurse', 'doctor']), carePlanController.getCarePlans);

/**
 * @swagger
 * /api/v1/care-plans/{carePlanId}:
 *   get:
 *     tags: [CarePlans]
 *     summary: Get one care plan
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: carePlanId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Care plan details
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/CarePlanDetailResponse' }
 *       400:
 *         description: Invalid care plan ID
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       401:
 *         description: Missing or invalid authentication token
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       403:
 *         description: Authenticated user lacks a clinical role
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       404:
 *         description: Care plan not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       500:
 *         description: Error fetching care plan
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.get('/:carePlanId', verifyToken, verifyRole(['admin', 'caretaker', 'nurse', 'doctor']), carePlanController.getCarePlanById);

/**
 * @swagger
 * /api/v1/care-plans/{carePlanId}:
 *   put:
 *     tags: [CarePlans]
 *     summary: Update a care plan
 *     description: >
 *       Admin-only mutation. Setting `status=inactive` archives the plan. Setting an inactive plan back to
 *       `active` fails with 409 when another active plan already exists for that patient.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: carePlanId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/CarePlanUpdateInput' }
 *     responses:
 *       200:
 *         description: Care plan updated
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/CarePlanMutationResponse' }
 *       400:
 *         description: Invalid IDs, role mismatch, invalid status, or tasks from another patient
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       401:
 *         description: Missing or invalid authentication token
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       403:
 *         description: Authenticated user is not an admin
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       404:
 *         description: Care plan not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       409:
 *         description: Another active care plan already exists for the patient
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       500:
 *         description: Error updating care plan
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.put('/:carePlanId', verifyToken, verifyRole(['admin']), carePlanController.updateCarePlan);

/**
 * @swagger
 * /api/v1/care-plans/{carePlanId}:
 *   delete:
 *     tags: [CarePlans]
 *     summary: Delete a care plan
 *     description: Permanently deletes a care plan. Use `status=inactive` when historical retention is required.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: carePlanId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Care plan deleted
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/MessageResponse' }
 *       400:
 *         description: Invalid care plan ID
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       401:
 *         description: Missing or invalid authentication token
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       403:
 *         description: Authenticated user is not an admin
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       404:
 *         description: Care plan not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       500:
 *         description: Error deleting care plan
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.delete('/:carePlanId', verifyToken, verifyRole(['admin']), carePlanController.deleteCarePlan);

module.exports = router;
