const User = require('../models/User');
const AppError = require('../utils/appError');
const asyncHandler = require('../utils/asyncHandler');

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
      return res
        .status(400)
        .json({ error: 'Please provide either caretakerId or email' });
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
    res
      .status(500)
      .json({
        error: 'Error fetching caretaker profile',
        details: error.message,
      });
  }
};

/**
 * POST /caretaker/profile
 * Update caretaker profile details
 */
exports.updateProfile = asyncHandler(async (req, res) => {
  // Verify user is a caretaker
  if (req.user.role !== 'caretaker') {
    throw new AppError(403, 'Access denied. Caretaker role required.');
  }

  const userId = req.user._id;
  const { fullName, email } = req.body;

  // Validate input fields
  const update = {};

  if (fullName !== undefined) {
    if (
      typeof fullName !== 'string' ||
      fullName.trim().length < 2 ||
      fullName.trim().length > 100
    ) {
      throw new AppError(400, 'Full name must be between 2 and 100 characters');
    }
    update.fullName = fullName.trim();
  }

  if (email !== undefined) {
    if (typeof email !== 'string') {
      throw new AppError(400, 'Email must be a string');
    }
    const emailNorm = email.toLowerCase().trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailNorm)) {
      throw new AppError(400, 'Invalid email format');
    }

    // Check if email already exists for another user
    const existingUser = await User.findOne({
      email: emailNorm,
      _id: { $ne: userId },
    });
    if (existingUser) {
      throw new AppError(409, 'Email already in use');
    }
    update.email = emailNorm;
  }

  if (Object.keys(update).length === 0) {
    throw new AppError(400, 'No valid fields to update');
  }

  // Update user profile
  const updatedUser = await User.findByIdAndUpdate(userId, update, {
    new: true,
    runValidators: true,
  });

  if (!updatedUser) {
    throw new AppError(404, 'User not found');
  }

  res.status(200).json({
    message: 'Profile updated successfully',
    user: {
      _id: updatedUser._id,
      fullName: updatedUser.fullName,
      email: updatedUser.email,
      role: updatedUser.role,
      org: updatedUser.org,
      isApproved: updatedUser.isApproved,
    },
  });
});
