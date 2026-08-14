const express = require('express');
const router = express.Router();

const verifyToken = require('../middleware/verifyToken');
const verifyRole = require('../middleware/verifyRole');

const indicatorController = require('../controllers/indicatorController');

// allow only logged-in medical staff (nurse, caretaker, doctor) on these routes
router.use(verifyToken, verifyRole(['nurse', 'caretaker', 'doctor']));

/**
 * @openapi
 * /api/v1/indicators:
 *   post:
 *     tags:
 *       - Indicators
 *     summary: Record a new patient indicator
 *     description: >
 *       Records an observed indicator for a patient (e.g. fatigue, pain, confusion),
 *       optionally linked to an active care plan.
 *       **Roles:** nurse, caretaker, doctor.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Indicator recorded successfully
 *       400:
 *         description: Validation error
 *       404:
 *         description: Patient not found
 */
router.post('/', indicatorController.createIndicator);

/**
 * @openapi
 * /api/v1/indicators:
 *   get:
 *     tags:
 *       - Indicators
 *     summary: List all indicators (paginated, optional status filter)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Paginated list of indicators
 */
router.get('/', indicatorController.listIndicators);

/**
 * @openapi
 * /api/v1/indicators/patient/{patientId}:
 *   get:
 *     tags:
 *       - Indicators
 *     summary: Get all indicators for a specific patient
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of indicators for the patient
 */
router.get('/patient/:patientId', indicatorController.listByPatient);

/**
 * @openapi
 * /api/v1/indicators/{id}:
 *   get:
 *     tags:
 *       - Indicators
 *     summary: Get one indicator by ID
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Indicator details
 *       404:
 *         description: Indicator not found
 */
router.get('/:id', indicatorController.getIndicator);

/**
 * @openapi
 * /api/v1/indicators/{id}:
 *   put:
 *     tags:
 *       - Indicators
 *     summary: Update an indicator (severity, status, notes)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Indicator updated
 *       404:
 *         description: Indicator not found
 */
router.put('/:id', indicatorController.updateIndicator);

/**
 * @openapi
 * /api/v1/indicators/{id}/actions:
 *   post:
 *     tags:
 *       - Indicators
 *     summary: Add a staff action in response to an indicator
 *     description: >
 *       Appends a new action to the indicator's action history, recording what
 *       the medical staff member did in response and who performed it.
 *       **Roles:** nurse, caretaker, doctor.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Action recorded
 *       404:
 *         description: Indicator not found
 */
router.post('/:id/actions', indicatorController.addAction);

/**
 * @openapi
 * /api/v1/indicators/{id}:
 *   delete:
 *     tags:
 *       - Indicators
 *     summary: Delete an indicator
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Indicator deleted
 *       404:
 *         description: Indicator not found
 */
router.delete('/:id', indicatorController.deleteIndicator);

module.exports = router;