const express = require('express');
const router = express.Router();
const WifiCSI = require('../models/WifiCSI');
const WifiCSIArchive = require('../models/WifiCSIArchive');
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
 *                 example: 64f1a2b3c4d5e6f789012345
 *                 description: Optional accessible patient ObjectId to link this WifiCSI record to a patient.
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
 *       403:
 *         description: Patient is not accessible to the authenticated user.
 *       404:
 *         description: Patient not found.
 */
router.post('/', verifyToken, async (req, res) => {
  try {
    const wifiCSIData = {
      user_id: req.user._id,
      timestamp: req.body.timestamp,
      csi_data: req.body.csi_data
    };

    const patientAccess = await applyPatientFromBody(req, wifiCSIData);
    if (!patientAccess.ok) {
      return res.status(patientAccess.status).json({ error: patientAccess.error });
    }

    const newWifiCSI = new WifiCSI(wifiCSIData);
    await newWifiCSI.save();
    res.status(201).json(newWifiCSI);
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message });
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
 *         description: Optional accessible patient ObjectId used to filter linked WifiCSI records.
 *     responses:
 *       200:
 *         description: List of WifiCSI records.
 *       400:
 *         description: Invalid patientId format.
 *       403:
 *         description: Patient is not accessible to the authenticated user.
 *       404:
 *         description: Patient not found.
 */
router.get('/', verifyToken, async (req, res) => {
  try {
    const scopedFilter = await buildScopedRecordFilter(req.user._id, req.query.patientId);
    if (!scopedFilter.ok) {
      return res.status(scopedFilter.status).json({ error: scopedFilter.error });
    }

    const data = await WifiCSI.find(scopedFilter.filter);
    res.status(200).json(data);
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message });
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
 *         description: Optional accessible patient ObjectId used to filter linked archived WifiCSI records.
 *     responses:
 *       200:
 *         description: List of archived WifiCSI records.
 *       400:
 *         description: Invalid patientId format.
 *       403:
 *         description: Patient is not accessible to the authenticated user.
 *       404:
 *         description: Patient not found.
 */
router.get('/archive', verifyToken, async (req, res) => {
  try {
    const scopedFilter = await buildScopedRecordFilter(req.user._id, req.query.patientId);
    if (!scopedFilter.ok) {
      return res.status(scopedFilter.status).json({ error: scopedFilter.error });
    }

    const data = await WifiCSIArchive.find(scopedFilter.filter);
    res.status(200).json(data);
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message });
  }
});

module.exports = router;
