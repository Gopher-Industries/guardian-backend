const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const WifiCSI = require('../models/WifiCSI');
const WifiCSIArchive = require('../models/WifiCSIArchive');
const verifyToken = require('../middleware/verifyToken');

function applyPatientFilter(req, filter) {
  const { patientId } = req.query;
  if (!patientId) return true;

  if (!mongoose.Types.ObjectId.isValid(patientId)) {
    return false;
  }

  filter.patient = patientId;
  return true;
}

/**
 * @swagger
 * /api/v1/wifi-csi:
 *   post:
 *     summary: Create a WifiCSI record
 *     tags: [WifiCSI]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - timestamp
 *               - csi_data
 *             properties:
 *               patientId:
 *                 type: string
 *                 description: Optional patient ObjectId to link this WifiCSI record to a patient.
 *               timestamp:
 *                 type: string
 *                 format: date-time
 *               csi_data:
 *                 type: object
 *     responses:
 *       201:
 *         description: WifiCSI record created successfully.
 *       400:
 *         description: Invalid request.
 */
router.post('/', verifyToken, async (req, res) => {
  try {
    const wifiCSIData = {
      user_id: req.user._id,
      timestamp: req.body.timestamp,
      csi_data: req.body.csi_data
    };

    if (req.body.patientId) {
      wifiCSIData.patient = req.body.patientId;
    }

    const newWifiCSI = new WifiCSI(wifiCSIData);
    await newWifiCSI.save();
    res.status(201).json(newWifiCSI);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/v1/wifi-csi:
 *   get:
 *     summary: Get WifiCSI records for the authenticated user
 *     tags: [WifiCSI]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: patientId
 *         schema:
 *           type: string
 *         required: false
 *         description: Optional patient ObjectId used to filter linked WifiCSI records.
 *     responses:
 *       200:
 *         description: List of WifiCSI records.
 *       400:
 *         description: Invalid patientId format.
 */
router.get('/', verifyToken, async (req, res) => {
  try {
    const filter = { user_id: req.user._id };
    if (!applyPatientFilter(req, filter)) {
      return res.status(400).json({ error: 'Invalid patientId format' });
    }

    const data = await WifiCSI.find(filter);
    res.status(200).json(data);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/v1/wifi-csi/archive:
 *   get:
 *     summary: Get archived WifiCSI records for the authenticated user
 *     tags: [WifiCSI]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: patientId
 *         schema:
 *           type: string
 *         required: false
 *         description: Optional patient ObjectId used to filter linked archived WifiCSI records.
 *     responses:
 *       200:
 *         description: List of archived WifiCSI records.
 *       400:
 *         description: Invalid patientId format.
 */
router.get('/archive', verifyToken, async (req, res) => {
  try {
    const filter = { user_id: req.user._id };
    if (!applyPatientFilter(req, filter)) {
      return res.status(400).json({ error: 'Invalid patientId format' });
    }

    const data = await WifiCSIArchive.find(filter);
    res.status(200).json(data);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
