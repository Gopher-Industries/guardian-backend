const Resource = require('../models/Resource');

/**
 * @swagger
 * /api/v1/resources:
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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 _id:
 * 
 *                   type: string
 *                 title:
 *                   type: string
 *                 type:
 *                   type: string
 *                 description:
 *                   type: string
 *                 link:
 *                   type: string
 *                 category:
 *                   type: string
 *                 isActive:
 *                   type: boolean
 *       400:
 *         description: title, type, and description are required
 *       500:
 *         description: Error creating resource
 */
exports.createResource = async (req, res) => {
  try {
    const { title, type, description, link, category, isActive } = req.body;

    if (!title || !type || !description) {
      return res.status(400).json({
        error: 'title, type, and description are required'
      });
    }

    const resource = await Resource.create({
      title,
      type,
      description,
      link,
      category,
      isActive
    });

    return res.status(201).json(resource);
  } catch (err) {
    return res.status(500).json({
      error: 'Error creating resource',
      details: err.message
    });
  }
};

/**
 * @swagger
 * tags:
 *   name: Resources
 *   description: Admin resource management APIs
 */

/**
 * @swagger
 * /api/v1/resources:
 *   get:
 *     summary: List all resources
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
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   _id:
 *                     type: string
 *                   title:
 *                     type: string
 *                   type:
 *                     type: string
 *                   description:
 *                     type: string
 *                   link:
 *                     type: string
 *                   category:
 *                     type: string
 *                   isActive:
 *                     type: boolean
 *       500:
 *         description: Error fetching resources
 */
exports.listResources = async (req, res) => {
  try {
    const { type } = req.query;

    const filter = {};
    if (type) {
      filter.type = type;
    }

    const resources = await Resource.find(filter).sort({ createdAt: -1 });

    return res.status(200).json(resources);
  } catch (err) {
    return res.status(500).json({
      error: 'Error fetching resources',
      details: err.message
    });
  }
};