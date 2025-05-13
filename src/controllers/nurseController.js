const User = require('../models/User');



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
 *         description: The ID of the nurse
 *       - in: query
 *         name: email
 *         schema:
 *           type: string
 *         description: The email of the nurse
 *     responses:
 *       200:
 *         description: Nurse profile fetched successfully
 *       404:
 *         description: Nurse not found
 *       500:
 *         description: Error fetching nurse profile
 */
exports.getProfile = async (req, res) => {
  try {
    const { nurseId, email } = req.query;

    // Build the query based on provided parameters
    const query = nurseId ? { _id: nurseId } : email ? { email } : null;
    if (!query) {
      return res.status(400).json({ error: 'Please provide either nurseId or email' });
    }

    // Find the nurse and populate role and assignedPatients
    const nurse = await User.findOne(query)
      .select('-password_hash -__v') // Exclude sensitive fields
      .populate('role', 'name') // Populate role with name
      .populate('assignedPatients', 'fullname age gender'); // Populate assignedPatients with full details

    if (!nurse) {
      return res.status(404).json({ error: 'Nurse not found' });
    }

    res.status(200).json(nurse);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching nurse profile', details: error.message });
  }
};
