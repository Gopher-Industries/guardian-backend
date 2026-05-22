

const express = require('express');
const router = express.Router();
const resourceController = require('../controllers/resourceController');
const verifyToken = require('../middleware/verifyToken');
const verifyRole = require('../middleware/verifyRole');

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