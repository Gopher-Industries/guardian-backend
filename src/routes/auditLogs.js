// Admin-only, read-only view into audit logs. Does not expose internal secrets.
const express = require('express');
const router = express.Router();
const AuditLog = require('../models/AuditLog');
const verifyToken = require('../middleware/verifyToken');
const verifyRole = require('../middleware/verifyRole');

/**
 * @openapi
 * tags:
 *   - name: Audit Logs
 *     description: Read-only endpoints for viewing audit logs (admin-only).
 */

/**
 * @openapi
 * components:
 *   schemas:
 *     AuditLog:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           description: Log id
 *           example: "66c8b3fd0c4b2a23d9c7f111"
 *         category:
 *           type: string
 *           description: Logical group/category for the event
 *           example: "auth"
 *         action:
 *           type: string
 *           description: Specific action name
 *           example: "LOGIN_SUCCESS"
 *         severity:
 *           type: string
 *           description: Severity level
 *           enum: [low, medium, high, critical]
 *           example: "low"
 *         actor:
 *           type: string
 *           description: User id or identifier of the actor
 *           example: "64ef1cd4a1b7c00012ab34cd"
 *         targetModel:
 *           type: string
 *           description: Model/entity type acted upon
 *           example: "User"
 *         targetId:
 *           type: string
 *           description: Identifier of the target entity
 *           example: "64ef1cd4a1b7c00012ab3500"
 *         details:
 *           type: object
 *           additionalProperties: true
 *           description: Arbitrary structured context for the event
 *           example:
 *             ip: "203.0.113.9"
 *             userAgent: "Mozilla/5.0 ..."
 *             note: "Admin approved nurse account"
 *         createdAt:
 *           type: string
 *           format: date-time
 *           example: "2025-08-12T03:14:15.926Z"
 */

/**
 * @openapi
 * /api/v1/admin/audit-logs:
 *   get:
 *     summary: List audit logs (paginated)
 *     description: Read-only, filterable list of audit logs. Admin role required.
 *     tags: [Audit Logs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *         description: 1-based page index
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 200, default: 50 }
 *         description: Page size (max 200)
 *       - in: query
 *         name: category
 *         schema: { type: string }
 *         description: Filter by category
 *       - in: query
 *         name: action
 *         schema: { type: string }
 *         description: Filter by action
 *       - in: query
 *         name: severity
 *         schema:
 *           type: string
 *           enum: [low, medium, high, critical]
 *         description: Filter by severity
 *       - in: query
 *         name: actor
 *         schema: { type: string }
 *         description: Filter by actor id
 *       - in: query
 *         name: targetModel
 *         schema: { type: string }
 *         description: Filter by target model
 *       - in: query
 *         name: targetId
 *         schema: { type: string }
 *         description: Filter by target id
 *     responses:
 *       200:
 *         description: Paginated audit logs
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 page: { type: integer, example: 1 }
 *                 limit: { type: integer, example: 50 }
 *                 total: { type: integer, example: 137 }
 *                 items:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/AuditLog'
 *       403:
 *         description: Forbidden (missing/invalid token or role)
 *       500:
 *         description: Server error
 */
router.get('/audit-logs', verifyToken, verifyRole(['admin']), async (req, res) => {
  try {
    const {
      page = 1, limit = 50,
      category, action, severity,
      actor, targetModel, targetId,
    } = req.query;

    const q = {};
    if (category) q.category = category;
    if (action) q.action = action;
    if (severity) q.severity = severity;
    if (actor) q.actor = actor;
    if (targetModel) q.targetModel = targetModel;
    if (targetId) q.targetId = targetId;

    const safeLimit = Math.min(200, Math.max(1, Number(limit)));
    const safePage = Math.max(1, Number(page));
    const skip = (safePage - 1) * safeLimit;

    const [items, total] = await Promise.all([
      AuditLog.find(q).sort({ createdAt: -1 }).skip(skip).limit(safeLimit).lean(),
      AuditLog.countDocuments(q),
    ]);

    res.status(200).json({
      page: safePage,
      limit: safeLimit,
      total,
      items,
    });
  } catch (err) {
    res.status(500).json({ message: 'Error fetching audit logs', details: err.message });
  }
});

module.exports = router;
