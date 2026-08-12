const express = require('express');
const router = express.Router();
const taskController = require('../controllers/taskController');
const verifyToken = require('../middleware/verifyToken');
const verifyRole = require('../middleware/verifyRole');
const upload = require('../middleware/multer');

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
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [title, description, dueDate, assigneeId]
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               dueDate:
 *                 type: string
 *                 format: date-time
 *                 description: Enter the due date and time in ISO 8601 format, for example 2026-08-20T10:00:00.000Z.
 *               priority:
 *                 type: string
 *                 enum: [low, medium, high]
 *                 default: medium
 *               status:
 *                 type: string
 *                 enum: [pending, in progress, completed]
 *                 default: pending
 *               patientId:
 *                 type: string
 *                 nullable: true
 *                 description: Optional patient linked to the task
 *               assigneeId:
 *                 type: string
 *                 description: The one staff member responsible for the task. Everyone may assign themselves; doctors may assign nurses or caretakers in their organization; admins may assign any staff member in their organization.
 *               relatedStaffIds:
 *                 type: array
 *                 description: Optional IDs of other staff associated with the task; these are not additional assignees
 *                 items:
 *                   type: string
 *               objectives:
 *                 type: array
 *                 description: One or more task objectives
 *                 items:
 *                   type: string
 *               deliverables:
 *                 type: array
 *                 description: Optional list of one or more expected deliverables
 *                 items:
 *                   type: string
 *     responses:
 *       201:
 *         description: Task created. The response includes setBy and created_at, which records when the task was set.
 *       400:
 *         description: Missing required fields or invalid care-team assignment
 *       403:
 *         description: The requester cannot assign the selected staff member, or the staff members belong to different organizations
 *       404:
 *         description: Patient or assignee not found
 */
router.post('/', upload.none(), taskController.createTask);

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
 *         multipart/form-data:
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
 *                 description: Enter the due date and time in ISO 8601 format, for example 2026-08-20T10:00:00.000Z.
 *               priority:
 *                 type: string
 *                 enum: [low, medium, high]
 *               status:
 *                 type: string
 *                 enum: [pending, in progress, completed]
 *               patientId:
 *                 type: string
 *                 nullable: true
 *                 description: Set to null to remove the patient from the task
 *               assigneeId:
 *                 type: string
 *                 description: Replace the one primary task assignee
 *               relatedStaffIds:
 *                 type: array
 *                 description: Replace the list of other staff associated with the task
 *                 items:
 *                   type: string
 *               objectives:
 *                 type: array
 *                 items:
 *                   type: string
 *               deliverables:
 *                 type: array
 *                 description: Use an empty array to remove all deliverables
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Task updated
 *       404:
 *         description: Task, patient, or assignee not found
 */
router.put('/:taskId', upload.none(), taskController.updateTask);

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
