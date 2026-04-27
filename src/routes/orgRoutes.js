const express = require('express');
const router = express.Router();

const verifyToken = require('../middleware/verifyToken');
const verifyRole = require('../middleware/verifyRole');
const orgController = require('../controllers/orgController');

// browse active orgs
router.get('/public', verifyToken, orgController.listActiveOrgs);

// freelance nurse/caretaker can request to join an org
router.post(
  '/join-request',
  verifyToken,
  verifyRole(['nurse', 'caretaker']),
  orgController.requestToJoinOrg
);

// admin-only routes
router.use(verifyToken, verifyRole(['admin']));

// create a new organization
router.post('/', orgController.createOrg);

// list organizations linked to this admin
router.get('/mine', orgController.listMyOrgs);

module.exports = router;