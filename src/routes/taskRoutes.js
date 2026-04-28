const express = require('express');
const router = express.Router();
const taskController = require('../controllers/taskController');
const verifyToken = require('../middleware/verifyToken');

router.post('/', verifyToken, taskController.createTask);
router.put('/:taskId', verifyToken, taskController.updateTask);
router.delete('/:taskId', verifyToken, taskController.deleteTask);
router.get('/patient/:patientId', verifyToken, taskController.getTasksByPatient);
router.get('/assignee/:assigneeId', verifyToken, taskController.getTasksByAssignee);

module.exports = router;
