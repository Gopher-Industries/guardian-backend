const express = require('express');
const router = express.Router();
const taskController = require('../controllers/taskController');
const verifyToken = require('../middleware/verifyToken');
const verifyRole = require('../middleware/verifyRole');

router.use(verifyToken, verifyRole(['admin', 'caretaker', 'nurse', 'doctor']));

/**
 * @swagger
 * tags:
 *   - name: Tasks
 *     description: Task management endpoints
 */

/**
 * @swagger
 * /api/v1/tasks:
 *   post:
 *     summary: Create a task
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, description, dueDate, patientId, assigneeId]
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               dueDate:
 *                 type: string
 *                 format: date-time
 *               priority:
 *                 type: string
 *                 enum: [low, medium, high]
 *               status:
 *                 type: string
 *                 enum: [pending, in progress, completed]
 *               patientId:
 *                 type: string
 *               assigneeId:
 *                 type: string
 *     responses:
 *       201:
 *         description: Task created
 *       400:
 *         description: Missing required fields
 *       404:
 *         description: Patient or assignee not found
 */
router.post('/', taskController.createTask);

/**
 * @swagger
 * /api/v1/tasks:
 *   get:
 *     summary: Get all tasks
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, in progress, completed]
 *       - in: query
 *         name: priority
 *         schema:
 *           type: string
 *           enum: [low, medium, high]
 *       - in: query
 *         name: patientId
 *         schema:
 *           type: string
 *       - in: query
 *         name: assigneeId
 *         schema:
 *           type: string
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
 *     responses:
 *       200:
 *         description: Paged task list
 */
router.get('/', taskController.getAllTasks);

/**
 * @swagger
 * /api/v1/tasks/{taskId}:
 *   put:
 *     summary: Update a task
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: taskId
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
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               dueDate:
 *                 type: string
 *                 format: date-time
 *               priority:
 *                 type: string
 *                 enum: [low, medium, high]
 *               status:
 *                 type: string
 *                 enum: [pending, in progress, completed]
 *               patientId:
 *                 type: string
 *               assigneeId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Task updated
 *       404:
 *         description: Task, patient, or assignee not found
 */
router.put('/:taskId', taskController.updateTask);

/**
 * @swagger
 * /api/v1/tasks/{taskId}:
 *   delete:
 *     summary: Delete a task
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: taskId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Task deleted
 *       404:
 *         description: Task not found
 */
router.delete('/:taskId', taskController.deleteTask);

/**
 * @swagger
 * /api/v1/tasks/patient/{patientId}:
 *   get:
 *     summary: Get tasks by patient
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: patientId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Task list for a patient
 */
router.get('/patient/:patientId', taskController.getTasksByPatient);

/**
 * @swagger
 * /api/v1/tasks/assignee/{assigneeId}:
 *   get:
 *     summary: Get tasks by assignee
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: assigneeId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Task list for an assignee
 */
router.get('/assignee/:assigneeId', taskController.getTasksByAssignee);

module.exports = router;
