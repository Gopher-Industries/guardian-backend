const express = require('express');
const router = express.Router();
const managementPlanController = require('../controllers/managementPlanController');
const verifyToken = require('../middleware/verifyToken');
const verifyRole = require('../middleware/verifyRole');

router.use(verifyToken);

/**
 * @swagger
 * tags:
 *   - name: Management Plans
 *     description: Diagnosis-level management plan endpoints. Create and update are doctor-only.
 *
 * components:
 *   schemas:
 *     ManagementPlan:
 *       type: object
 *       properties:
 *         _id: { type: string }
 *         care_plan: { type: string }
 *         diagnosis: { type: string }
 *         management: { type: string }
 *         changes_logged:
 *           type: array
 *           items: { type: string }
 *         created_at: { type: string, format: date-time }
 *         updated_at: { type: string, format: date-time }
 */

/**
 * @swagger
 * /api/v1/management-plans:
 *   post:
 *     summary: Create a management plan
 *     description: >
 *       Only one management plan may exist per diagnosis. **Roles:** doctor only.
 *     tags: [Management Plans]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [carePlanId, diagnosis]
 *             properties:
 *               carePlanId: { type: string }
 *               diagnosis: { type: string }
 *               management: { type: string }
 *     responses:
 *       201:
 *         description: Management plan created
 *       400:
 *         description: Invalid request body
 *       403:
 *         description: Only a doctor can create a management plan
 *       404:
 *         description: Care plan not found
 *       409:
 *         description: A management plan already exists for this diagnosis
 */
router.post('/', verifyRole(['doctor']), managementPlanController.createManagementPlan);

/**
 * @swagger
 * /api/v1/management-plans/{managementPlanId}:
 *   get:
 *     summary: Get one management plan
 *     tags: [Management Plans]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: managementPlanId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Management plan details
 *       404:
 *         description: Management plan not found
 */
router.get('/:managementPlanId', verifyRole(['admin', 'caretaker', 'nurse', 'doctor']), managementPlanController.getManagementPlanById);

/**
 * @swagger
 * /api/v1/management-plans/care-plan/{carePlanId}:
 *   get:
 *     summary: Get management plans for a care plan
 *     tags: [Management Plans]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: carePlanId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Management plans for the care plan
 */
router.get('/care-plan/:carePlanId', verifyRole(['admin', 'caretaker', 'nurse', 'doctor']), managementPlanController.getManagementPlansByCarePlan);

/**
 * @swagger
 * /api/v1/management-plans/diagnosis/{diagnosis}:
 *   get:
 *     summary: Get the management plan for a diagnosis
 *     description: Since a diagnosis can have at most one management plan, this looks it up directly by diagnosis text.
 *     tags: [Management Plans]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: diagnosis
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: The management plan for that diagnosis
 *       404:
 *         description: No management plan exists for this diagnosis
 */
router.get('/diagnosis/:diagnosis', verifyRole(['admin', 'caretaker', 'nurse', 'doctor']), managementPlanController.getManagementPlanByDiagnosis);

/**
 * @swagger
 * /api/v1/management-plans/{managementPlanId}:
 *   put:
 *     summary: Update a management plan
 *     description: >
 *       Requires a changeLog string describing the edit. The server prepends
 *       the current date (server clock) to the changeLog text and appends
 *       it to changes_logged. **Roles:** doctor only.
 *     tags: [Management Plans]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: managementPlanId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [changeLog]
 *             properties:
 *               diagnosis: { type: string }
 *               management: { type: string }
 *               changeLog: { type: string }
 *     responses:
 *       200:
 *         description: Management plan updated
 *       400:
 *         description: changeLog is required
 *       403:
 *         description: Only a doctor can update a management plan
 *       409:
 *         description: A management plan already exists for this diagnosis
 */
router.put('/:managementPlanId', verifyRole(['doctor']), managementPlanController.updateManagementPlan);

module.exports = router;