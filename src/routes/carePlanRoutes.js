const express = require('express');
const router = express.Router();
const carePlanController = require('../controllers/carePlanController');
const verifyToken = require('../middleware/verifyToken');

/**
 * @swagger
 * tags:
 *   - name: Care Plans
 *     description: Care plan management endpoints
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
 *               title:
 *                 type: string
 *               patientId:
 *                 type: string
 *               tasks:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       201:
 *         description: Care plan created
 *       400:
 *         description: Missing required fields
 *       404:
 *         description: Patient not found
 */
router.post('/', verifyToken, carePlanController.createCarePlan);

/**
 * @swagger
 * /api/v1/care-plans:
 *   get:
 *     summary: Get all care plans
 *     tags: [Care Plans]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: patientId
 *         schema:
 *           type: string
 *       - in: query
 *         name: authorId
 *         schema:
 *           type: string
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
 *         description: Paged care plan list
 */
router.get('/', verifyToken, carePlanController.getAllCarePlans);

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
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               patient:
 *                 type: string
 *               tasks:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Care plan updated
 *       404:
 *         description: Care plan not found
 */
router.put('/:carePlanId', verifyToken, carePlanController.updateCarePlan);

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
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Care plan deleted
 *       404:
 *         description: Care plan not found
 */
router.delete('/:carePlanId', verifyToken, carePlanController.deleteCarePlan);

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
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Care plans for a patient
 */
router.get('/patient/:patientId', verifyToken, carePlanController.getCarePlanByPatient);

module.exports = router;
