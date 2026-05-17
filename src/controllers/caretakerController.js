const User = require('../models/User');
const Task = require('../models/Task');
const Role = require('../models/Role');
const DailyReport = require('../models/DailyReport');
const Patient = require('../models/Patient'); 
const PatientLog = require('../models/PatientLog'); 



/**
 * @swagger
 * /api/v1/caretaker/profile:
 *   get:
 *     summary: View caretaker profile by ID or email
 *     tags: [Caretaker]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: caretakerId
 *         schema:
 *           type: string
 *         description: The ID of the caretaker
 *       - in: query
 *         name: email
 *         schema:
 *           type: string
 *         description: The email of the caretaker
 *     responses:
 *       200:
 *         description: Caretaker profile fetched successfully
 *       404:
 *         description: Caretaker not found
 *       500:
 *         description: Error fetching caretaker profile
 */
exports.getProfile = async (req, res) => {
  try {
    const { caretakerId, email } = req.query;

    const query = caretakerId ? { _id: caretakerId } : email ? { email } : null;
    if (!query) {
      return res.status(400).json({ error: 'Please provide either caretakerId or email' });
    }

    const caretaker = await User.findOne(query)
      .select('-password_hash -__v')
      .populate('role', 'name')
      .populate('organization', 'name')
      .populate('assignedPatients', 'fullname age gender');

    if (!caretaker) {
      return res.status(404).json({ error: 'Caretaker not found' });
    }

    res.status(200).json(caretaker);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching caretaker profile', details: error.message });
  }
};

/**
 * @swagger
 * /api/v1/caretaker/profile:
 *   put:
 *     summary: Update caretaker profile
 *     tags: [Caretaker]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [caretakerId]
 *             properties:
 *               caretakerId:
 *                 type: string
 *                 description: The ID of the caretaker
 *               fullname:
 *                 type: string
 *               phone:
 *                 type: string
 *               gender:
 *                 type: string
 *               age:
 *                 type: number
 *               email:
 *                 type: string
 *               address:
 *                 type: string
 *     responses:
 *       200:
 *         description: Caretaker profile updated successfully
 *       400:
 *         description: Invalid request
 *       404:
 *         description: Caretaker not found
 *       500:
 *         description: Server error
 */
exports.updateProfile = async (req, res) => {
  try {
    const { caretakerId, ...updates } = req.body;

    if (!caretakerId) {
      return res.status(400).json({ error: 'Missing caretakerId' });
    }

    const updatedCaretaker = await User.findByIdAndUpdate(
      caretakerId,
      { $set: updates },
      { new: true, runValidators: true, context: 'query' }
    )
      .select('-password_hash -__v')
      .populate('role', 'name')
      .populate('assignedPatients', 'fullname age gender');

    if (!updatedCaretaker) {
      return res.status(404).json({ error: 'Caretaker not found' });
    }

    res.status(200).json({
      message: 'Caretaker profile updated successfully',
      profile: updatedCaretaker,
    });
  } catch (error) {
    res.status(500).json({ error: 'Error updating profile', details: error.message });
  }
};

/**
 * @swagger
 * /api/v1/caretaker/tasks:
 *   get:
 *     summary: List caretaker tasks with optional filters
 *     tags: [Caretaker]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: filter
 *         schema:
 *           type: string
 *           enum: [urgent]
 *         description: Use "urgent" to filter high-priority tasks
 *       - in: query
 *         name: dueDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Return tasks due on or before this date (YYYY-MM-DD)
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, in progress, completed]
 *         description: Filter by task status
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [dueDate, -dueDate, created_at, -created_at]
 *         description: "Sort results (default: dueDate ascending)"
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: "Page number for pagination (default: 1)"
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *         description: "Page size (default: 20)"
 *     responses:
 *       200:
 *         description: List of tasks
 *       400:
 *         description: Invalid query parameters
 *       500:
 *         description: Error fetching tasks
 */
exports.getTasks = async (req, res) => {
  try {
    const { filter, dueDate, status, sort, page = '1', limit = '20' } = req.query;

    const caretakerId = req.query.caretakerId || req.user?.id;
    if (!caretakerId) {
      return res.status(400).json({ error: 'Missing caretaker context' });
    }

    const query = { assignee: caretakerId };

    if (filter === 'urgent') {
      query.priority = 'high';
    }

    if (dueDate) {
      const dt = new Date(dueDate);
      if (Number.isNaN(dt.getTime())) {
        return res.status(400).json({ error: 'Invalid dueDate. Use YYYY-MM-DD.' });
      }
      const endOfDay = new Date(dt);
      endOfDay.setHours(23, 59, 59, 999);
      query.dueDate = { $lte: endOfDay };
    }

    if (status) {
      const allowed = ['pending', 'in progress', 'completed'];
      if (!allowed.includes(status)) {
        return res.status(400).json({ error: 'Invalid status value' });
      }
      query.status = status;
    }

    let sortSpec = { dueDate: 1 };
    if (sort) {
      const direction = sort.startsWith('-') ? -1 : 1;
      const field = sort.replace(/^-/, '');
      if (!['dueDate', 'created_at'].includes(field)) {
        return res.status(400).json({ error: 'Invalid sort field' });
      }
      sortSpec = { [field]: direction };
    }

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
    const skip = (pageNum - 1) * limitNum;

    const [items, total] = await Promise.all([
      Task.find(query)
        .sort(sortSpec)
        .skip(skip)
        .limit(limitNum)
        .populate('patient', 'fullname gender')
        .lean(),
      Task.countDocuments(query),
    ]);

    return res.status(200).json({
      page: pageNum,
      limit: limitNum,
      total,
      items,
    });
  } catch (error) {
    return res.status(500).json({ error: 'Error fetching tasks', details: error.message });
  }
};
/**
 * @swagger
 * /api/v1/caretaker:
 *   get:
 *     summary: Get all caretakers
 *     tags: [Caretaker]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: email
 *         schema: { type: string }
 *       - in: query
 *         name: sort
 *         schema: { type: string, default: "-created_at" }
 *     responses:
 *       200:
 *         description: Paged list of caretakers
 *       500:
 *         description: Server error
 */

exports.getAllCaretakers = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const skip = (page - 1) * limit;

    const { search, email, sort = '-created_at' } = req.query;

    const role = await Role.findOne({ name: 'caretaker' });
    if (!role) {
      return res.status(500).json({ message: 'Caretaker role not found in DB' });
    }

    const filter = { role: role._id };

    if (search) {
      filter.fullname = { $regex: search, $options: 'i' };
    }
    if (email) {
      filter.email = { $regex: email, $options: 'i' };
    }

    const [total, caretakers] = await Promise.all([
      User.countDocuments(filter),
      User.find(filter)
        .select('-password_hash -__v')
        .populate('role', 'name')
        .populate('assignedPatients', 'fullname gender dateOfBirth')
        .sort(sort)
        .skip(skip)
        .limit(limit)
    ]);

    return res.status(200).json({
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      data: caretakers
    });
  } catch (err) {
    return res.status(500).json({ message: 'Error fetching caretakers', details: err.message });
  }
};

/**
 * @swagger
 * /api/v1/caretaker/reports/patient/{patientId}:
 *   get:
 *     summary: Get all daily reports for a specific patient
 *     tags: [Caretaker]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: patientId
 *         required: true
 *         schema:
 *           type: string
 *         description: Patient ID
 *     responses:
 *       200:
 *         description: List of reports for the patient
 *       400:
 *         description: Missing patientId
 *       500:
 *         description: Server error
 */

// GET reports by patient
exports.getReportsByPatient = async (req, res) => {
  try {
    const { patientId } = req.params;

    if (!patientId) {
      return res.status(400).json({ error: 'patientId is required' });
    }

    const reports = await DailyReport.find({ patient: patientId })
      .populate('patient', 'fullname gender')
      .populate('caretaker', 'fullname email')
      .sort({ createdAt: -1 });

    res.status(200).json(reports);

  } catch (error) {
    res.status(500).json({ error: 'Error fetching reports', details: error.message });
  }
}
// Caretaker dashboard summary 
/**
 * @swagger
 * /api/v1/caretaker/dashboard-summary:
 *   get:
 *     summary: Get caretaker dashboard summary
 *     tags: [Caretaker]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Caretaker dashboard summary
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalPatients:
 *                   type: integer
 *                   description: Total patients under this caretaker
 *                 totalActivePatients:
 *                   type: integer
 *                   description: Active (non-deleted) patients under this caretaker
 *                 totalTasks:
 *                   type: integer
 *                   description: Total tasks assigned to this caretaker
 *                 completedTasks:
 *                   type: integer
 *                   description: Completed tasks for this caretaker
 *                 pendingTasks:
 *                   type: integer
 *                   description: Pending tasks for this caretaker
 *                 recentLogsCount:
 *                   type: integer
 *                   description: Logs created by this caretaker in the last 7 days
 *       500:
 *         description: Error fetching caretaker dashboard summary
 */

exports.getDashboardSummary = async (req, res) => {
  try {
    const caretakerId = req.user._id;

    // Get Role _id for "caretaker"
    const caretakerRole = await Role.findOne({ name: 'caretaker' }).lean();
    if (!caretakerRole) {
      return res.status(500).json({ error: 'Role "caretaker" not found' });
    }

    const totalPatients = await Patient.countDocuments({ caretaker: caretakerId });
    const totalActivePatients = await Patient.countDocuments({ caretaker: caretakerId, isDeleted: false });

    const totalTasks = await Task.countDocuments({ assignee: caretakerId });
    const completedTasks = await Task.countDocuments({ assignee: caretakerId, status: 'completed' });
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