const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const ActivityRecognition = require('../models/ActivityRecognition');
const verifyToken = require('../middleware/verifyToken');

function applyPatientFromBody(req, data) {
  const { patientId } = req.body;
  if (!patientId) return true;

  if (!mongoose.Types.ObjectId.isValid(patientId)) {
    return false;
  }

  data.patient = patientId;
  return true;
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
 *                 description: Optional patient ObjectId to link this activity record to a patient.
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

    if (!applyPatientFromBody(req, activityData)) {
      return res.status(400).json({ error: 'Invalid patientId format' });
    }

    const newActivity = new ActivityRecognition(activityData);
    await newActivity.save();
    res.status(201).json(newActivity);
  } catch (error) {
    res.status(400).json({ error: error.message });
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
 *         description: Optional patient ObjectId used to filter linked activity recognition records.
 *     responses:
 *       200:
 *         description: List of activity recognition records.
 *       400:
 *         description: Invalid patientId format.
 */
router.get('/', verifyToken, async (req, res) => {
  try {
    const filter = {};
    const { patientId } = req.query;
    if (patientId) {
      if (!mongoose.Types.ObjectId.isValid(patientId)) {
        return res.status(400).json({ error: 'Invalid patientId format' });
      }
      filter.patient = patientId;
    }

    const activities = await ActivityRecognition.find(filter);
    res.status(200).json(activities);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
