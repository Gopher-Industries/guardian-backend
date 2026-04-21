const User = require('../models/User');
const Role = require('../models/Role');
const Patient = require('../models/Patient'); // only for population types
const Task = require('../models/Task'); // only for dashboard summary
const PatientLog = require('../models/PatientLog'); // only for population types

/**
 * @swagger
 * /api/v1/nurse/profile:
 *   get:
 *     summary: View nurse profile by ID or email
 *     tags: [Nurse]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: nurseId
 *         schema:
 *           type: string
 *       - in: query
 *         name: email
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Nurse profile fetched successfully
 *       404:
 *         description: Nurse not found
 */
exports.getProfile = async (req, res) => {
  try {
    const { nurseId, email } = req.query;

    const query = nurseId ? { _id: nurseId } : email ? { email } : null;
    if (!query) return res.status(400).json({ error: 'Please provide either nurseId or email' });

    const nurse = await User.findOne(query)
      .select('-password_hash -__v')
      .populate('role', 'name')
      .populate('assignedPatients', 'fullname gender dateOfBirth');

    if (!nurse) return res.status(404).json({ error: 'Nurse not found' });

    res.status(200).json(nurse);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching nurse profile', details: error.message });
  }
};


/**
 * @swagger
 * /api/v1/nurse/all:
 *   get:
 *     summary: Get all nurses
 *     description: Fetch a paginated list of all nurses (role = nurse).
 *     tags: [Nurse]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         schema: { type: string }
 *         description: Search by fullname or email
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *         description: Page number (default 1)
 *       - in: query
 *         name: limit
 *         schema: { type: integer }
 *         description: Results per page (default 10)
 *     responses:
 *       200:
 *         description: List of nurses
 */
exports.getAllNurses = async (req, res) => {
  try {
    const { q, page = 1, limit = 10 } = req.query;

    // look up the "nurse" role id
    const nurseRole = await Role.findOne({ name: 'nurse' });
    if (!nurseRole) return res.status(500).json({ error: 'Nurse role not seeded' });

    const textFilter = q
      ? { $or: [{ fullname: new RegExp(q, 'i') }, { email: new RegExp(q, 'i') }] }
      : {};

    const filter = { role: nurseRole._id, ...textFilter };

    const [nurses, total] = await Promise.all([
      User.find(filter)
        .select('-password_hash -__v')
        .populate('role', 'name')
        .populate('assignedPatients', 'fullname gender dateOfBirth')
        .sort({ fullname: 1 })
        .skip((parseInt(page) - 1) * parseInt(limit))
        .limit(parseInt(limit))
        .lean(),
      User.countDocuments(filter),
    ]);

    res.status(200).json({
      nurses,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        limit: parseInt(limit),
      },
    });
  } catch (error) {
    res.status(500).json({ error: 'Error fetching nurses', details: error.message });
  }
};


/**
 * @swagger
 * /api/v1/nurse/assigned-patients:
 *   get:
 *     summary: Get patients assigned to the logged-in nurse
 *     tags: [Nurse]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of assigned patients
 */
exports.getAssignedPatientsForNurse = async (req, res) => {
  try {
    const nurse = await User.findById(req.user._id)
      .select('-password_hash -__v')
      .populate({
        path: 'assignedPatients',
        select: 'fullname dateOfBirth gender caretaker assignedNurses created_at updated_at',
        populate: [
          { path: 'caretaker', select: 'fullname email' },
          { path: 'assignedNurses', select: 'fullname email' }
        ]
      });

    if (!nurse) return res.status(404).json({ error: 'Nurse not found' });

    const patients = (nurse.assignedPatients || []).map(p => p.toObject());

    res.status(200).json({ nurse: { id: nurse._id, fullname: nurse.fullname }, patients });
  } catch (err) {
    res.status(500).json({ error: 'Error fetching assigned patients', details: err.message });
  }
};

// Dashboard summary for nurse's own dashboard
/**
 * @swagger
 * /api/v1/nurse/dashboard-summary:
 *   get:
 *     summary: Get nurse dashboard summary
 *     tags: [Nurse]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Nurse dashboard summary
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalPatients:
 *                   type: integer
 *                   description: Total patients assigned to the nurse
 *                 totalActivePatients:
 *                   type: integer
 *                   description: Active (non-deleted) patients assigned to the nurse
 *                 totalTasks:
 *                   type: integer
 *                   description: Total tasks assigned to the nurse
 *                 completedTasks:
 *                   type: integer
 *                   description: Completed tasks assigned to the nurse
 *                 pendingTasks:
 *                   type: integer
 *                   description: Pending tasks assigned to the nurse
 *                 recentLogsCount:
 *                   type: integer
 *                   description: Patient logs created by the nurse in the last 7 days
 *       500:
 *         description: Error fetching nurse dashboard summary
 */
exports.getDashboardSummary = async (req, res) => {
  try {
    const nurseId = req.user._id;

    // Get Role _id for "nurse"
    const nurseRole = await Role.findOne({ name: 'nurse' }).lean();
    if (!nurseRole) {
      return res.status(500).json({ error: 'Role "nurse" not found' });
    }

    const totalPatients = await Patient.countDocuments({ assignedNurses: nurseId });
    const totalActivePatients = await Patient.countDocuments({ assignedNurses: nurseId, isDeleted: false });

    const totalTasks = await Task.countDocuments({ assignee: nurseId });
    const completedTasks = await Task.countDocuments({ assignee: nurseId, status: 'completed' });
    const pendingTasks = totalTasks - completedTasks;

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentLogsCount = await PatientLog.countDocuments({
      createdBy: req.user._id,
      createdAt: { $gte: sevenDaysAgo }
    });

    const summary = {
      totalPatients,
      totalActivePatients,
      totalTasks,
      completedTasks,
      pendingTasks,
      recentLogsCount
    };

    res.status(200).json(summary);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching dashboard summary', details: error.message });
  }
};