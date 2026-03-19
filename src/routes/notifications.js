const express = require('express');
const router = express.Router();

const { createAndEmit, getUserNotifications, markAsRead } = require('../services/notificationService');
// Use your existing auth middleware
const verifyToken = require('../middleware/verifyToken'); 
const Notification = require('../models/Notification');

function getUserIdFromReq(req) {
  return String(
    req.user?.id ||
    req.user?._id ||
    req.user?.userId ||
    req.user?.sub ||
    ''
  );
}
/**
 * @swagger
 * /api/v1/notifications:
 *   post:
 *     summary: Create a notification for a user
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *               - title
 *               - message
 *             properties:
 *               userId:
 *                 type: string
 *               title:
 *                 type: string
 *               message:
 *                 type: string
 *     responses:
 *       201:
 *         description: Notification created successfully
 *       400:
 *         description: Missing required fields
 *       500:
 *         description: Error creating notification
 */
// Create a notification for a user
router.post('/', verifyToken, async (req, res) => {
  try {
    const { userId, title, message } = req.body;
    if (!userId || !title || !message) {
      return res.status(400).json({ message: 'userId, title and message are required.' });
    }
    const notification = await createAndEmit(userId, title, message);
    res.status(201).json(notification);
  } catch (err) {
    res.status(500).json({ message: 'Error creating notification.', error: err.message });
  }
});


// Get notifications for the authenticated user
/**
 * @swagger
 * /api/v1/notifications:
 *   get:
 *     summary: Get all notifications for the authenticated user
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of notifications
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   _id:
 *                     type: string
 *                   userId:
 *                     type: string
 *                   title:
 *                     type: string
 *                   message:
 *                     type: string
 *                   isRead:
 *                     type: boolean
 *                   createdAt:
 *                     type: string
 *                     format: date-time
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Error fetching notifications
 */
router.get('/', verifyToken, async (req, res) => {
  try {
    const authUserId = getUserIdFromReq(req);
    if (!authUserId) return res.status(401).json({ message: 'Unauthorized' });

    const notifications = await getUserNotifications(authUserId);
    res.json(notifications);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching notifications.', error: err.message });
  }
});

// Delete a notification
/**
 * @swagger
 * /api/v1/notifications/{id}:
 *   delete:
 *     summary: Delete a notification by ID
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Notification ID
 *     responses:
 *       200:
 *         description: Notification deleted successfully
 *       404:
 *         description: Notification not found
 *       500:
 *         description: Error deleting notification
 */
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const deleted = await Notification.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: 'Notification not found.' });
    res.json({ message: 'Notification deleted successfully.' });
  } catch (err) {
    res.status(500).json({ message: 'Error deleting notification.', error: err.message });
  }
});

// Mark a notification as read
/**
 * @swagger
 * /api/v1/notifications/{id}/read:
 *   patch:
 *     summary: Mark a notification as read
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Notification ID
 *     responses:
 *       200:
 *         description: Notification marked as read
 *       500:
 *         description: Error updating notification
 */
router.patch('/:id/read', verifyToken, async (req, res) => {
  try {
    const updated = await markAsRead(req.params.id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: 'Error updating notification.', error: err.message });
  }
});

module.exports = router;
