const User = require('../models/User');
const Role = require('../models/Role');
const Patient = require('../models/Patient'); // only for population types

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
      .populate('organization', 'name')
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
