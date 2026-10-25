const express = require('express');
const router = express.Router();

const roomController = require('../controllers/roomController');
const verifyToken = require('../middleware/verifyToken');
const verifyRole = require('../middleware/verifyRole');

router.use(verifyToken);

/**
 * @openapi
 * /api/v1/rooms:
 *   post:
 *     tags:
 *       - Rooms
 *     summary: Create a new room
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               location:
 *                 type: string
 *                 example: "664f1c2e8b1a2c3d4e5f6a7b"
 *               roomNo:
 *                 type: integer
 *                 example: 101
 *               floor:
 *                 type: integer
 *                 example: 1
 *               wing:
 *                 type: string
 *                 example: "A"
 *     responses:
 *       201:
 *         description: Room created successfully
 *       400:
 *         description: Invalid request
 */
router.post('/', verifyRole('admin'), roomController.createRoom);

/**
 * @openapi
 * /api/v1/rooms:
 *   get:
 *     tags:
 *       - Rooms
 *     summary: Get all rooms
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of rooms
 */
router.get('/', roomController.getAllRooms);

/**
 * @openapi
 * /api/v1/rooms/{id}:
 *   get:
 *     tags:
 *       - Rooms
 *     summary: Get a room by ID
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Room found
 *       404:
 *         description: Room not found
 */
router.get('/:id', roomController.getRoomById);

/**
 * @openapi
 * /api/v1/rooms/{id}:
 *   patch:
 *     tags:
 *       - Rooms
 *     summary: Update a room
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               location:
 *                 type: string
 *               roomNo:
 *                 type: integer
 *               floor:
 *                 type: integer
 *               wing:
 *                 type: string
 *     responses:
 *       200:
 *         description: Room updated successfully
 *       404:
 *         description: Room not found
 */
router.patch('/:id', verifyRole('admin'), roomController.updateRoom);

/**
 * @openapi
 * /api/v1/rooms/{id}:
 *   delete:
 *     tags:
 *       - Rooms
 *     summary: Delete a room
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Room deleted successfully
 *       404:
 *         description: Room not found
 */
router.delete('/:id', verifyRole('admin'), roomController.deleteRoom);

module.exports = router;