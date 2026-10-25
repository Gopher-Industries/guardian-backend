const express = require('express');
const router = express.Router();

const controller =
  require('../controllers/messageController');

const verifyToken =
  require('../middleware/verifyToken');

const verifyRole =
  require('../middleware/verifyRole');

const messagingRoles = [
  'admin',
  'doctor',
  'nurse',
  'caretaker'
];

/**
 * @swagger
 * tags:
 *   name: Messages
 *   description: Private staff messaging
 */

/**
 * @swagger
 * /api/v1/messages:
 *   post:
 *     summary: Send a private message
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/x-www-form-urlencoded:
 *           schema:
 *             type: object
 *             required:
 *               - recipientId
 *               - message
 *             properties:
 *               recipientId:
 *                 type: string
 *                 description: Recipient User ObjectId
 *               message:
 *                 type: string
 *                 description: Message text
 *                 maxLength: 5000
 *     responses:
 *       201:
 *         description: Message sent successfully
 *       400:
 *         description: Invalid request
 *       403:
 *         description: Access denied
 *       404:
 *         description: User not found
 */
router.post(
  '/',
  verifyToken,
  verifyRole(messagingRoles),
  controller.sendMessage
);

/**
 * @swagger
 * /api/v1/messages/conversations:
 *   get:
 *     summary: Get my conversations
 *     description: Returns only conversations involving the logged-in user.
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           maximum: 100
 *     responses:
 *       200:
 *         description: Conversations returned successfully
 *       400:
 *         description: Organization could not be determined
 *       404:
 *         description: User not found
 */
router.get(
  '/conversations',
  verifyToken,
  verifyRole(messagingRoles),
  controller.getConversations
);

/**
 * @swagger
 * /api/v1/messages/users:
 *   get:
 *     summary: Find users to message
 *     description: Returns messaging users from the logged-in user's organization.
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *           enum:
 *             - admin
 *             - doctor
 *             - nurse
 *             - caretaker
 *         description: Select user role
 *       - in: query
 *         name: name
 *         schema:
 *           type: string
 *         description: Search by user name
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           maximum: 100
 *     responses:
 *       200:
 *         description: Users returned successfully
 *       400:
 *         description: Invalid role or organization
 *       404:
 *         description: User not found
 */
router.get(
  '/users',
  verifyToken,
  verifyRole(messagingRoles),
  controller.searchMessageUsers
);

/**
 * @swagger
 * /api/v1/messages/conversation/{userId}/read:
 *   patch:
 *     summary: Mark conversation as read
 *     description: Marks unread messages received from this user as read.
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: Other user's ObjectId
 *     responses:
 *       200:
 *         description: Conversation marked as read
 *       400:
 *         description: Invalid user ID
 *       403:
 *         description: Access denied
 *       404:
 *         description: User not found
 */
router.patch(
  '/conversation/:userId/read',
  verifyToken,
  verifyRole(messagingRoles),
  controller.markConversationAsRead
);

/**
 * @swagger
 * /api/v1/messages/conversation/{userId}:
 *   get:
 *     summary: Get private conversation
 *     description: Returns messages only between the logged-in user and the selected user.
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: Other user's ObjectId
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 30
 *           maximum: 100
 *     responses:
 *       200:
 *         description: Conversation returned successfully
 *       400:
 *         description: Invalid user ID
 *       403:
 *         description: Access denied
 *       404:
 *         description: User not found
 */
router.get(
  '/conversation/:userId',
  verifyToken,
  verifyRole(messagingRoles),
  controller.getConversation
);

module.exports = router;