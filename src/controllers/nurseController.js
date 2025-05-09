const User = require('../models/User');


/**
 * @swagger
 * /api/v1/nurse/{nurseId}/profile:
 *   get:
 *     summary: View nurse profile
 *     tags: [Nurse]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: nurseId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the nurse
 *     responses:
 *       200:
 *         description: Nurse profile fetched successfully
 *       400:
 *         description: Error fetching nurse profile
 */
exports.getProfile = async (req, res) => {
  try {
    const { nurseId } = req.params;

    const nurse = await Nurse.findById(nurseId).select('-password');
    // const nurse = await Nurse.findById(req.params.nurseId);
    if (!nurse) {
      return res.status(404).json({ error: 'Nurse not found' });
    }

    res.status(200).json(nurse);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching nurse profile', details: error.message });
  }
};
