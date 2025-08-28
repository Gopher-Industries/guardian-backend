const User = require('../models/User');

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
 * @swagger
 * /api/v1/caretaker/profile:
 *   post:
 *     summary: Update caretaker profile
 *     description: Allows caretakers to update their profile details including name, email, and notification preferences
 *     tags: [Caretaker]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fullName:
 *                 type: string
 *                 minLength: 2
 *                 maxLength: 100
 *                 description: Full name of the caretaker
 *                 example: "John Doe"
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Email address of the caretaker
 *                 example: "john.doe@example.com"
 *               notificationPreferences:
 *                 type: object
 *                 description: Notification preferences for the caretaker
 *                 properties:
 *                   email:
 *                     type: boolean
 *                     description: Enable email notifications
 *                   sms:
 *                     type: boolean
 *                     description: Enable SMS notifications
 *                   push:
 *                     type: boolean
 *                     description: Enable push notifications
 *                   patient_updates:
 *                     type: boolean
 *                     description: Enable patient update notifications
 *                   system_alerts:
 *                     type: boolean
 *                     description: Enable system alert notifications
 *                   medication_reminders:
 *                     type: boolean
 *                     description: Enable medication reminder notifications
 *                   appointment_reminders:
 *                     type: boolean
 *                     description: Enable appointment reminder notifications
 *                 example:
 *                   email: true
 *                   sms: false
 *                   push: true
 *                   patient_updates: true
 *                   system_alerts: false
 *                   medication_reminders: true
 *                   appointment_reminders: false
 *     responses:
 *       200:
 *         description: Profile updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Profile updated successfully"
 *                 user:
 *                   type: object
 *                   properties:
 *                     _id:
 *                       type: string
 *                     fullName:
 *                       type: string
 *                     email:
 *                       type: string
 *                     role:
 *                       type: string
 *                     notificationPreferences:
 *                       type: object
 *       400:
 *         description: Bad Request - Invalid input data
 *       401:
 *         description: Unauthorized - Invalid or missing JWT token
 *       403:
 *         description: Forbidden - User is not a caretaker
 *       404:
 *         description: Not Found - User not found
 *       409:
 *         description: Conflict - Email already in use
 */
exports.updateProfile = async (req, res) => {
  try {
    const userId = req.user._id;
    
    // Get user from database to check role
    const user = await User.findById(userId).populate('role');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Verify user is a caretaker
    if (user.role.name !== 'caretaker') {
      return res.status(403).json({ error: 'Access denied. Caretaker role required.' });
    }
    const { fullName, email, notificationPreferences } = req.body;

    // Validate input fields
    const update = {};

    if (fullName !== undefined) {
      if (typeof fullName !== 'string' || fullName.trim().length < 2 || fullName.trim().length > 100) {
        return res.status(400).json({ error: 'Full name must be between 2 and 100 characters' });
      }
      update.fullName = fullName.trim();
    }

    if (email !== undefined) {
      if (typeof email !== 'string') {
        return res.status(400).json({ error: 'Email must be a string' });
      }
      const emailNorm = email.toLowerCase().trim();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(emailNorm)) {
        return res.status(400).json({ error: 'Invalid email format' });
      }

      // Check if email already exists for another user
      const existingUser = await User.findOne({ email: emailNorm, _id: { $ne: userId } });
      if (existingUser) {
        return res.status(409).json({ error: 'Email already in use' });
      }
      update.email = emailNorm;
    }

    if (notificationPreferences !== undefined) {
      if (typeof notificationPreferences !== 'object' || notificationPreferences === null) {
        return res.status(400).json({ error: 'Notification preferences must be an object' });
      }
      
      const validKeys = ['email', 'sms', 'push', 'patient_updates', 'system_alerts', 'medication_reminders', 'appointment_reminders'];
      const prefs = {
        email: true,
        sms: false,
        push: true,
        patient_updates: true,
        system_alerts: true,
        medication_reminders: true,
        appointment_reminders: true
      };
      
      for (const [key, value] of Object.entries(notificationPreferences)) {
        if (!validKeys.includes(key)) {
          return res.status(400).json({ error: `Invalid notification preference: ${key}` });
        }
        if (typeof value !== 'boolean') {
          return res.status(400).json({ error: `Notification preference ${key} must be a boolean` });
        }
        prefs[key] = value;
      }
      
      update.notificationPreferences = prefs;
    }

    if (Object.keys(update).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    // Update user profile
    const updatedUser = await User.findByIdAndUpdate(userId, update, {
      new: true,
      runValidators: true
    });

    if (!updatedUser) {
      return res.status(404).json({ error: 'User not found' });
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
        notificationPreferences: updatedUser.notificationPreferences
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
