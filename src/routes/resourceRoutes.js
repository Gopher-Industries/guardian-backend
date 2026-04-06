

const express = require('express');
const router = express.Router();
const resourceController = require('../controllers/resourceController');
const verifyToken = require('../middleware/verifyToken');
const verifyRole = require('../middleware/verifyRole');

/**
 * @swagger
 * tags:
 *   name: Resources
 *   description: Resource management APIs
 */

/**
 * @swagger
 * /api/v1/resources:
 *   get:
 *     summary: Get all resources
 *     tags: [Resources]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *         required: false
 *         description: Filter resources by type
 *     responses:
 *       200:
 *         description: Resources fetched successfully
 *       500:
 *         description: Error fetching resources
 *   post:
 *     summary: Create a new resource
 *     tags: [Resources]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - type
 *               - description
 *             properties:
 *               title:
 *                 type: string
 *               type:
 *                 type: string
 *               description:
 *                 type: string
 *               link:
 *                 type: string
 *               category:
 *                 type: string
 *               isActive:
 *                 type: boolean
 *     responses:
 *       201:
 *         description: Resource created successfully
 *       400:
 *         description: Missing required fields
 *       500:
 *         description: Error creating resource
 */
router.get(
  '/',
  verifyToken,
  verifyRole(['admin']),
  resourceController.listResources
);

router.post(
  '/',
  verifyToken,
  verifyRole(['admin']),
  resourceController.createResource
);

module.exports = router;