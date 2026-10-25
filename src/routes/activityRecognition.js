const express = require('express');
const router = express.Router();
const ActivityRecognition = require('../models/ActivityRecognition');
const verifyToken = require('../middleware/verifyToken');
const {
  buildScopedRecordFilter,
  validateAccessiblePatient
} = require('../utils/patientAccess');

async function applyPatientFromBody(req, data) {
  const { patientId } = req.body;
  if (!patientId) return { ok: true };

  const access = await validateAccessiblePatient(req.user._id, patientId);
  if (!access.ok) {
    return access;
  }

  data.patient = access.patient._id;
  return { ok: true };
}

/**
 * @swagger
 * /api/v1/activity-recognition:
 *   post:
 *     summary: Create an activity recognition record
 *     tags: [ActivityRecognition]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - activity_type
 *               - confidence
 *               - detected_at
 *             properties:
 *               patientId:
 *                 type: string
 *                 example: 64f1a2b3c4d5e6f789012345
 *                 description: Optional accessible patient ObjectId to link this activity record to a patient.
 *               wifi_csi_id:
 *                 type: string
 *                 example: 64f1a2b3c4d5e6f789012346
 *                 description: Optional WifiCSI ObjectId linked to this activity record.
 *               activity_type:
 *                 type: string
 *               confidence:
 *                 type: number
 *               detected_at:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       201:
 *         description: Activity recognition record created successfully.
 *       400:
 *         description: Invalid request.
 *       403:
 *         description: Patient is not accessible to the authenticated user.
 *       404:
 *         description: Patient not found.
 */
router.post('/', verifyToken, async (req, res) => {
  try {
    const activityData = {
      user_id: req.user._id,
      wifi_csi_id: req.body.wifi_csi_id,
      activity_type: req.body.activity_type,
      confidence: req.body.confidence,
      detected_at: req.body.detected_at
    };

    const patientAccess = await applyPatientFromBody(req, activityData);
    if (!patientAccess.ok) {
      return res.status(patientAccess.status).json({ error: patientAccess.error });
    }

    const newActivity = new ActivityRecognition(activityData);
    await newActivity.save();
    res.status(201).json(newActivity);
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/v1/activity-recognition:
 *   get:
 *     summary: Get activity recognition records
 *     tags: [ActivityRecognition]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: patientId
 *         schema:
 *           type: string
 *         required: false
 *         description: Optional accessible patient ObjectId used to filter linked activity recognition records.
 *     responses:
 *       200:
 *         description: List of activity recognition records.
 *       400:
 *         description: Invalid patientId format.
 *       403:
 *         description: Patient is not accessible to the authenticated user.
 *       404:
 *         description: Patient not found.
 */
router.get('/', verifyToken, async (req, res) => {
  try {
    const { patientId } = req.query;
    const scopedFilter = await buildScopedRecordFilter(req.user._id, patientId);
    if (!scopedFilter.ok) {
      return res.status(scopedFilter.status).json({ error: scopedFilter.error });
    }

    const activities = await ActivityRecognition.find(scopedFilter.filter);
    res.status(200).json(activities);
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message });
  }
});

module.exports = router;
