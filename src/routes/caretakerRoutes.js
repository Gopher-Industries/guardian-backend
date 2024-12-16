const express = require('express');
const router = express.Router();
const caretakerController = require('../controllers/caretakerController.js');
const verifyToken = require('../middleware/verifyToken.js');

// Caretaker Task Routes
router.post('/tasks', verifyToken, caretakerController.assignTask);
router.get('/tasks', verifyToken, caretakerController.getTasks);
router.put('/tasks/:taskId', verifyToken, caretakerController.updateTask);
router.delete('/tasks/:taskId', verifyToken, caretakerController.deleteTask);

module.exports = router;
