const PatientLog = require('../models/PatientLog');
const User = require('../models/User');

function normalizeActionsRequired(value) {
  if (Array.isArray(value)) return value;
  if (value == null || value === '') return [];

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch (_error) {
      return [value];
    }
  }

  return [value];
}

/**
 * @swagger
 * /api/v1/patient-logs:
 *   post:
 *     summary: Create a patient note
 *     description: Allows medical staff to record a patient note entry while keeping the patient-logs endpoint name.
 *     tags: [Patient Logs]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - patient
 *               - title
 *               - observations
 *             properties:
 *               patient:
 *                 type: string
 *                 example: 688de2621911784a80507314
 *               location:
 *                 type: string
 *                 enum: [home, hospital, clinic, care_facility, telehealth, other]
 *                 example: care_facility
 *               address:
 *                 type: string
 *                 example: 12 King Street, Melbourne VIC
 *               title:
 *                 type: string
 *                 example: Mobility follow-up
 *               observations:
 *                 type: string
 *                 example: Patient reported improved balance during morning walk.
 *               actionsRequired:
 *                 oneOf:
 *                   - type: array
 *                     items: { type: string }
 *                   - type: object
 *                 example: ["Review gait tomorrow", "Update physio plan"]
 *               recordedAt:
 *                 type: string
 *                 format: date-time
 *                 example: 2026-08-23T09:30:00Z
 *     responses:
 *       201:
 *         description: Patient note created successfully
 *       400:
 *         description: Missing required fields
 *       401:
 *         description: Missing, invalid, or expired token
 *       500:
 *         description: Internal server error
 */
exports.createLog = async (req, res) => {
  try {
    const { patient, location, address, title, observations, actionsRequired, recordedAt } = req.body;

    if (!patient || !title || !observations) {
      return res.status(400).json({ error: 'patient, title, and observations are required.' });
    }

    const newLog = await PatientLog.create({
      patient,
      location,
      address,
      author: req.user._id,
      title,
      observations,
      actionsRequired: normalizeActionsRequired(actionsRequired),
      recordedAt: recordedAt || new Date()
    });

    const populated = await PatientLog.findById(newLog._id)
      .populate('author', 'fullname email role')
      .populate('patient', 'fullname');

    res.status(201).json({
      message: 'Patient note created successfully',
      log: populated
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * @swagger
 * /api/v1/patient-logs/{patientId}:
 *   get:
 *     summary: Get patient notes by patient ID
 *     description: Returns all patient notes recorded for a specific patient.
 *     tags: [Patient Logs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: patientId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the patient
 *     responses:
 *       200:
 *         description: Patient notes fetched successfully
 *       401:
 *         description: Missing, invalid, or expired token
 *       500:
 *         description: Internal server error
 */
exports.getLogsByPatient = async (req, res) => {
  try {
    const { patientId } = req.params;
    const logs = await PatientLog.find({ patient: patientId })
      .populate('author', 'fullname email role')
      .sort({ recordedAt: -1, createdAt: -1 });

    res.status(200).json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * @swagger
 * /api/v1/patient-logs/{id}:
 *   delete:
 *     summary: Delete a patient note
 *     description: Deletes a patient note. Only the author or an admin can delete it.
 *     tags: [Patient Logs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the patient note
 *     responses:
 *       200:
 *         description: Patient note deleted successfully
 *       401:
 *         description: Missing, invalid, or expired token
 *       403:
 *         description: Permission denied
 *       404:
 *         description: Patient note not found
 *       500:
 *         description: Internal server error
 */
exports.deleteLog = async (req, res) => {
  try {
    const { id } = req.params;
    const log = await PatientLog.findById(id);

    if (!log) return res.status(404).json({ error: 'Patient note not found' });

    const requester = await User.findById(req.user._id).populate('role', 'name');
    const isAdmin = requester?.role?.name === 'admin';
    if (!log.author.equals(req.user._id) && !isAdmin) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    await PatientLog.findByIdAndDelete(id);
    res.status(200).json({ message: 'Patient note deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
