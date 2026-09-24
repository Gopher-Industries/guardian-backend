const express = require('express');
const router = express.Router();
const carePlanController = require('../controllers/carePlanController');
const verifyToken = require('../middleware/verifyToken');
const verifyRole = require('../middleware/verifyRole');

router.use(verifyToken);

/**
 * @swagger
 * tags:
 *   - name: Care Plans
 *     description: Care plan management endpoints. Create and update are doctor-only.
 *
 * components:
 *   schemas:
 *     CarePlan:
 *       type: object
 *       properties:
 *         _id: { type: string }
 *         title: { type: string }
 *         description: { type: string }
 *         patient: { type: string }
 *         provider: { type: string }
 *         diagnosis: { type: string }
 *         tasks:
 *           type: array
 *           items: { type: string }
 *         prescriptions: {}
 *         reviewDate: { type: string, format: date-time, nullable: true }
 *         relatedAppointments: {}
 *         created_at: { type: string, format: date-time }
 *         updated_at: { type: string, format: date-time }
 */

/**
 * @swagger
 * /api/v1/care-plans:
 *   post:
 *     summary: Create a care plan
 *     description: '**Roles:** doctor only.'
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
 *               description: { type: string }
 *               diagnosis: { type: string }
 *               tasks:
 *                 type: array
 *                 items: { type: string }
 *               reviewDate: { type: string, format: date-time, nullable: true }
 *               prescriptions: {}
 *               relatedAppointments: {}
 *     responses:
 *       201:
 *         description: Care plan created
 *       400:
 *         description: Invalid request body
 *       403:
 *         description: Only a doctor can create a care plan
 */
router.post('/', verifyRole(['doctor']), carePlanController.createCarePlan);

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
 *         name: providerId
 *         schema: { type: string }
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
router.get('/', verifyRole(['admin', 'caretaker', 'nurse', 'doctor']), carePlanController.getAllCarePlans);

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
router.get('/patient/:patientId', verifyRole(['admin', 'caretaker', 'nurse', 'doctor']), carePlanController.getCarePlanByPatient);

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
router.get('/:carePlanId', verifyRole(['admin', 'caretaker', 'nurse', 'doctor']), carePlanController.getCarePlanById);

/**
 * @swagger
 * /api/v1/care-plans/{carePlanId}:
 *   put:
 *     summary: Update a care plan
 *     description: >
 *       All fields optional, only fields included in the body are updated.
 *       **Roles:** doctor only.
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
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title: { type: string }
 *               patientId: { type: string }
 *               description: { type: string }
 *               diagnosis: { type: string }
 *               tasks:
 *                 type: array
 *                 items: { type: string }
 *               reviewDate: { type: string, format: date-time, nullable: true }
 *               prescriptions: {}
 *               relatedAppointments: {}
 *     responses:
 *       200:
 *         description: Care plan updated
 *       403:
 *         description: Only a doctor can update a care plan
 */
router.put('/:carePlanId', verifyRole(['doctor']), carePlanController.updateCarePlan);

/**
 * @swagger
 * /api/v1/care-plans/{carePlanId}:
 *   delete:
 *     summary: Delete a care plan
 *     description: >
 *       Not explicitly covered by the doctor-only requirement (which named
 *       only create and update), so left open to the same roles as before.
 *       Confirm with Sam if delete should also be doctor-only.
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
router.delete('/:carePlanId', verifyRole(['admin', 'caretaker', 'nurse', 'doctor']), carePlanController.deleteCarePlan);

module.exports = router;