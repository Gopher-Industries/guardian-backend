// controllers/patientLogController.js
const mongoose = require('mongoose');
const PatientLog = require('../models/PatientLog');
const Patient = require('../models/Patient');
const User = require('../models/User');

const getUserId = (req) => req.user?._id || req.user?.id;

const getRoleName = async (req) => {
  if (req.user?.role?.name) {
    return req.user.role.name;
  }
  if (req.user?.role && typeof req.user.role === 'string' && !mongoose.isValidObjectId(req.user.role)) {
    return req.user.role;
  }
  const userId = getUserId(req);
  const user = await User.findById(userId)
    .populate('role', 'name')
    .select('role')
    .lean();
  return user?.role?.name || user?.role;
};

const isSameId = (a, b) => { return a && b && a.toString() === b.toString(); };

const canModifyLog = async (log, req) => {
  const userId = getUserId(req);
  const roleName = await getRoleName(req);
  return isSameId(log.createdBy, userId) || roleName === 'admin';
};

const canAccessPatientLogs = async (patientId, req) => {
  const userId = getUserId(req);
  const roleName = await getRoleName(req);

  if (roleName === 'admin') return true;

  const patient = await Patient.findById(patientId)
    .select('caretaker assignedNurses assignedDoctor')
    .lean();

  if (!patient) return false;

  if (roleName === 'caretaker') {
    return isSameId(patient.caretaker, userId);
  }

  if (roleName === 'nurse') {
    return patient.assignedNurses?.some((nurseId) => isSameId(nurseId, userId));
  }

  if (roleName === 'doctor') {
    return isSameId(patient.assignedDoctor, userId);
  }

  return false;
};

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
      createdBy: req.user._id,
      title,
      observations,
      actionsRequired: normalizeActionsRequired(actionsRequired),
      recordedAt: recordedAt || new Date()
    });

    const populated = await PatientLog.findById(newLog._id)
      .populate('createdBy', 'fullname email role')
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
 *     description: Returns paginated patient note entries for a specific patient. Accessible by admin, nurse, caretaker, and doctor.
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
 *         example: 69b77c228345cdf421d22ba3
 *       - in: query
 *         name: page
 *         required: false
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         required: false
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Number of logs per page. Maximum allowed value is 100.
 *       - in: query
 *         name: sort
 *         required: false
 *         schema:
 *           type: string
 *           default: -createdAt
 *           example: -createdAt
 *         description: Sort order for logs. Use -createdAt for newest first or createdAt for oldest first.
 *     responses:
 *       200:
 *         description: Patient notes fetched successfully
 *       401:
 *         description: Missing, invalid, or expired token
 *       403:
 *         description: Access denied due to insufficient role
 *       500:
 *         description: Internal server error
 */
exports.getLogsByPatient = async (req, res) => {
  try {
    const { patientId } = req.params;

    if (!mongoose.isValidObjectId(patientId)) {
      return res.status(400).json({
        error: 'Invalid patient ID.'
      });
    }

    const hasAccess = await canAccessPatientLogs(patientId, req);

    if (!hasAccess) {
      return res.status(403).json({
        error: 'Permission denied. You do not have access to this patient logs.'
      });
    }

    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const allowedSortValues = ['createdAt', '-createdAt'];
    const sort = allowedSortValues.includes(req.query.sort)
      ? req.query.sort
      : '-createdAt';

    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      PatientLog.find({ patient: patientId })
        .populate('createdBy', 'fullname role')
        .sort(sort)
        .skip(skip)
        .limit(limit),
      PatientLog.countDocuments({ patient: patientId })
    ]);

    res.status(200).json({
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      data: logs
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * @swagger
 * /api/v1/patient-logs/{id}:
 *   put:
 *     summary: Update a patient note
 *     description: Updates a patient note entry. Only the original creator or an admin can update it.
 *     tags: [Patient Logs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the log entry to update
 *         example: 69c123456789abcdef123456
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *                 example: Updated mobility follow-up
 *               observations:
 *                 type: string
 *                 example: Patient was calm and responsive after breakfast.
 *               location:
 *                 type: string
 *                 enum: [home, hospital, clinic, care_facility, telehealth, other]
 *               address:
 *                 type: string
 *               actionsRequired:
 *                 oneOf:
 *                   - type: array
 *                     items: { type: string }
 *                   - type: object
 *     responses:
 *       200:
 *         description: Log updated successfully
 *       400:
 *         description: At least one field is required
 *       401:
 *         description: Unauthorized or missing token
 *       403:
 *         description: Permission denied. Only the creator or admin can update this log.
 *       404:
 *         description: Log not found
 *       500:
 *         description: Internal server error
 */
exports.updateLog = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, observations, location, address, actionsRequired } = req.body;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        error: 'Invalid log ID.'
      });
    }

    if (!title && !observations && !location && !address && actionsRequired === undefined) {
      return res.status(400).json({
        error: 'At least one field (title, observations, location, address, actionsRequired) is required.'
      });
    }

    const log = await PatientLog.findById(id);

    if (!log) {
      return res.status(404).json({
        error: 'Log not found'
      });
    }

    if (!(await canModifyLog(log, req))) {
      return res.status(403).json({
        error: 'Permission denied. Only the creator or admin can update this log.'
      });
    }

    if (title) log.title = title;
    if (observations) log.observations = observations;
    if (location) log.location = location;
    if (address) log.address = address;
    if (actionsRequired !== undefined) log.actionsRequired = normalizeActionsRequired(actionsRequired);

    log.updatedBy = getUserId(req);
    log.updatedAt = new Date();

    const updatedLog = await log.save();

    res.status(200).json({
      message: 'Log updated successfully',
      log: updatedLog
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * @swagger
 * /api/v1/patient-logs/{id}:
 *   delete:
 *     summary: Delete a patient note
 *     description: Deletes a patient note. Only the creator or an admin can delete it.
 *     tags: [Patient Logs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the log entry to delete
 *         example: 69c123456789abcdef123456
 *     responses:
 *       200:
 *         description: Log deleted successfully
 *       401:
 *         description: Unauthorized or missing token
 *       403:
 *         description: Permission denied. Only the creator or admin can delete this log.
 *       404:
 *         description: Patient note not found
 *       500:
 *         description: Internal server error
 */
exports.deleteLog = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        error: 'Invalid log ID.'
      });
    }

    const log = await PatientLog.findById(id);

    if (!log) {
      return res.status(404).json({
        error: 'Patient note not found'
      });
    }

    if (!(await canModifyLog(log, req))) {
      return res.status(403).json({
        error: 'Permission denied. Only the creator or admin can delete this log.'
      });
    }

    await PatientLog.findByIdAndDelete(id);

    res.status(200).json({
      message: 'Log deleted successfully'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
