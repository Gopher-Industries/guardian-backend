const User = require('../models/User');


/**
 * @swagger
 * /api/v1/caretaker/{caretakerId}/profile:
 *   get:
 *     summary: View caretaker profile
 *     tags: [Caretaker]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: caretakerId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the caretaker
 *     responses:
 *       200:
 *         description: Caretaker profile fetched successfully
 *       400:
 *         description: Error fetching caretaker profile
 */
exports.getProfile = async (req, res) => {
  try {
    const { caretakerId } = req.params;

    const caretaker = await User.findById(caretakerId).select('-password');
    // const caretaker = await Caretaker.findById(req.params.caretakerId);
    if (!caretaker) {
      return res.status(404).json({ error: 'Caretaker not found' });
    }

    res.status(200).json(caretaker);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching caretaker profile', details: error.message });
  }
};
