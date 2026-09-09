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
const isSameId = (a, b) => { return a && b && a.toString() === b.toString();};

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


exports.createLog = async (req, res) => {
  try {
    const { title, description, patient } = req.body;

    if (!title || !description || !patient) {
      return res.status(400).json({
        error: 'Title, description, and patient ID are required.'
      });
    }

    const newLog = await PatientLog.create({
      title,
      description,
      patient,
      createdBy: req.user._id
    });

    res.status(201).json({
      message: 'Log created successfully',
      log: newLog
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * @swagger
 * /api/v1/patient-logs/{patientId}:
 *   get:
 *     summary: Get patient logs with pagination
 *     description: Returns paginated log entries for a specific patient. Accessible by admin, nurse, caretaker, and doctor.
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
 *         description: Logs fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 page:
 *                   type: integer
 *                   example: 1
 *                 limit:
 *                   type: integer
 *                   example: 20
 *                 total:
 *                   type: integer
 *                   example: 3
 *                 totalPages:
 *                   type: integer
 *                   example: 1
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                       title:
 *                         type: string
 *                       description:
 *                         type: string
 *                       patient:
 *                         type: string
 *                       createdBy:
 *                         type: object
 *                       createdAt:
 *                         type: string
 *       401:
 *         description: Unauthorized or missing token
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
 *     summary: Update a patient log entry
 *     description: Updates a patient log entry. Only the original creator or an admin can update the log.
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
 *                 example: Updated patient mood update
 *               description:
 *                 type: string
 *                 example: Patient was calm and responsive after breakfast.
 *     responses:
 *       200:
 *         description: Log updated successfully
 *       400:
 *         description: At least title or description is required
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
    const { title, description } = req.body;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
      error: 'Invalid log ID.'
      });
    }

    if (!title && !description) {
      return res.status(400).json({
        error: 'At least title or description is required.'
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
    if (description) log.description = description;

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
 *     summary: Delete a patient log entry
 *     description: Deletes a patient log entry. Only the original creator or an admin can delete the log.
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
 *         description: Log not found
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
        error: 'Log not found'
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