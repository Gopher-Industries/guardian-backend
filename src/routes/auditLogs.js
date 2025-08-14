// Admin-only, read-only view into audit logs. Does not expose internal secrets.
const express = require('express');
const router = express.Router();
const AuditLog = require('../models/AuditLog');
const verifyToken = require('../middleware/verifyToken');
const verifyRole = require('../middleware/verifyRole');

/**
 * GET /api/v1/admin/audit-logs
 * Query params (all optional):
 *  - page (default 1)
 *  - limit (default 50, max 200)
 *  - category, action, severity, actor, targetModel, targetId
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
