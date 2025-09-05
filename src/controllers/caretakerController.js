const User = require('../models/User');
const Task = require('../models/Task');


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

    // Build the query based on provided parameters
    const query = caretakerId ? { _id: caretakerId } : email ? { email } : null;
    if (!query) {
      return res.status(400).json({ error: 'Please provide either caretakerId or email' });
    }

    // Find the caretaker and populate role and assignedPatients
    const caretaker = await User.findOne(query)
      .select('-password_hash -__v') // Exclude sensitive fields
      .populate('role', 'name') // Populate role with name
      .populate('assignedPatients', 'fullname age gender'); // Populate assignedPatients with full details

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
 *         description: Sort results (default: dueDate ascending)
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Page number for pagination (default: 1)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *         description: Page size (default: 20)
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

    // IMPORTANT: tie to logged-in caretaker
    // If your JWT stores the caretaker document _id in req.user.id, this works directly.
    // If your Task.caretaker references a different collection (_id not equal to User _id),
    // accept ?caretakerId override or map here as needed.
    const caretakerId = req.query.caretakerId || req.user?.id;
    if (!caretakerId) {
      return res.status(400).json({ error: 'Missing caretaker context' });
    }

    // Build query
    const query = { caretaker: caretakerId };

    if (filter === 'urgent') {
      query.priority = 'high'; // maps from "urgent" to priority=high
    }

    if (dueDate) {
      const dt = new Date(dueDate);
      if (Number.isNaN(dt.getTime())) {
        return res.status(400).json({ error: 'Invalid dueDate. Use YYYY-MM-DD.' });
      }
      // Tasks due on or before provided date (end of that day)
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

    // Sorting
    let sortSpec = { dueDate: 1 }; // default: soonest first
    if (sort) {
      // e.g., "dueDate", "-dueDate", "created_at", "-created_at"
      const direction = sort.startsWith('-') ? -1 : 1;
      const field = sort.replace(/^-/, '');
      if (!['dueDate', 'created_at'].includes(field)) {
        return res.status(400).json({ error: 'Invalid sort field' });
      }
      sortSpec = { [field]: direction };
    }

    // Pagination
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