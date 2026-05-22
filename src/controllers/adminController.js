const Patient = require('../models/Patient');
const HealthRecord = require('../models/HealthRecord');
const Task = require('../models/Task');
const CarePlan = require('../models/CarePlan');
const User = require('../models/User');
const Role = require('../models/Role');
const PatientLog = require('../models/PatientLog');
//const SupportTicket = require('../models/SupportTicket');
const notifyRules = require('../services/notifyRules');

/**
 * @swagger
 * components:
 *   schemas:
 *     Task:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *         title:
 *           type: string
 *         description:
 *           type: string
 *         dueDate:
 *           type: string
 *           format: date-time
 *         priority:
 *           type: string
 *           enum: [low, medium, high]
 *         status:
 *           type: string
 *           enum: [pending, in progress, completed]
 *         patient:
 *           type: string
 *         assignee:
 *           type: string
 *         caretaker:
 *           type: string
 *         nurse_id:
 *           type: string
 *         report:
 *           type: string
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 */

/**
 * @swagger
 * /api/v1/admin/patient-overview/{patientId}:
 *   get:
 *     summary: Fetch detailed patient overview
 *     tags: [Admin]
 *     parameters:
 *       - in: path
 *         name: patientId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the patient
 *     responses:
 *       200:
 *         description: Detailed patient overview
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 patient:
 *                   $ref: '#/components/schemas/Patient'
 *                 healthRecords:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/HealthRecord'
 *                 carePlan:
 *                   $ref: '#/components/schemas/CarePlan'
 *                 tasks:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Task'
 *                 taskCompletionRate:
 *                   type: number
 *                   description: Percentage of completed tasks
 *       404:
 *         description: Patient not found
 *       500:
 *         description: Error fetching patient overview
 */
exports.getPatientOverview = async (req, res) => {
  try {
    const { patientId } = req.params;

    const patientDetails = await Patient.findById(patientId)
      .populate('caretaker')
      .populate('assignedNurses');

    if (!patientDetails) {
      return res.status(404).json({ message: 'Patient not found' });
    }

    const healthRecords = await HealthRecord.find({ patient: patientId });
    const tasks = await Task.find({ patient: patientId });
    const carePlan = await CarePlan.findOne({ patient: patientId }).populate('tasks');

    const taskCompletionRate = tasks.length
      ? (tasks.filter(task => task.status === 'completed').length / tasks.length) * 100
      : 0;

    const response = {
      patient: patientDetails,
      healthRecords,
      carePlan,
      tasks,
      taskCompletionRate,
    };

    res.status(200).json(response);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching patient overview', details: error.message });
  }
};

/**
 * @swagger
 * /api/v1/admin/support-ticket:
 *   post:
 *     summary: Create a support ticket
 *     tags: [Admin]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - subject
 *               - description
 *             properties:
 *               subject:
 *                 type: string
 *               description:
 *                 type: string
 *               status:
 *                 type: string
 *                 default: open
 *     responses:
 *       201:
 *         description: Support ticket created successfully
 *       500:
 *         description: Error creating support ticket
 */
exports.createSupportTicket = async (req, res) => {
  try {
    const { subject, description, status } = req.body;

    const newTicket = new SupportTicket({
      user: req.user._id,
      subject,
      description,
      status: status || 'open',
    });

    await newTicket.save();
    Promise.resolve(
      notifyRules.supportTicketCreated({
        ticketId: newTicket._id,
        userId: newTicket.user,
        actorId: req.user?._id
      })
    ).catch(() => { });
    res.status(201).json({ message: 'Support ticket created', ticket: newTicket });
  } catch (error) {
    res.status(500).json({ message: 'Error creating support ticket', details: error.message });
  }
};

/**
 * @swagger
 * /api/v1/admin/support-tickets:
 *   get:
 *     summary: Fetch all support tickets
 *     tags: [Admin]
 *     parameters:
 *       - in: query
 *         name: status
 *         required: false
 *         schema:
 *           type: string
 *         description: Filter tickets by status (e.g., open, closed)
 *       - in: query
 *         name: userId
 *         required: false
 *         schema:
 *           type: string
 *         description: Filter tickets by user ID
 *     responses:
 *       200:
 *         description: List of support tickets
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/SupportTicket'
 *       500:
 *         description: Error fetching support tickets
 */
exports.getSupportTickets = async (req, res) => {
  try {
    const { status, userId } = req.query;

    const query = {};
    if (status) query.status = status;
    if (userId) query.user = userId;

    const tickets = await SupportTicket.find(query).populate('user');
    res.status(200).json(tickets);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching support tickets', details: error.message });
  }
};

/**
 * @swagger
 * /api/v1/admin/support-ticket/{ticketId}:
 *   put:
 *     summary: Update a support ticket
 *     tags: [Admin]
 *     parameters:
 *       - in: path
 *         name: ticketId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the support ticket to be updated
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *                 description: New status of the support ticket (e.g., open, closed)
 *               adminResponse:
 *                 type: string
 *                 description: Response or comments from the admin
 *     responses:
 *       200:
 *         description: Support ticket updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 ticket:
 *                   $ref: '#/components/schemas/SupportTicket'
 *       404:
 *         description: Support ticket not found
 *       500:
 *         description: Error updating support ticket
 */
exports.updateSupportTicket = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { status, adminResponse } = req.body;

    const updatedTicket = await SupportTicket.findByIdAndUpdate(
      ticketId,
      { status, adminResponse },
      { new: true }
    );

    if (!updatedTicket) {
      return res.status(404).json({ message: 'Support ticket not found' });
    }
    Promise.resolve(
      notifyRules.supportTicketUpdated({
        ticketId: updatedTicket._id,
        userId: updatedTicket.user,
        status: updatedTicket.status,
        actorId: req.user?._id
      })
    ).catch(() => { });
    res.status(200).json({ message: 'Support ticket updated', ticket: updatedTicket });
  } catch (error) {
    res.status(500).json({ message: 'Error updating support ticket', details: error.message });
  }
};

/**
 * @swagger
 * /api/v1/admin/tasks:
 *   post:
 *     summary: Create a new task
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - description
 *               - patientId
 *               - dueDate
 *               - assigneeId
 *             properties:
 *               title:
 *                 type: string
 *                 description: Task title. Defaults to description when omitted.
 *               description:
 *                 type: string
 *                 description: Task description
 *               patientId:
 *                 type: string
 *                 description: ID of the patient this task is for
 *               dueDate:
 *                 type: string
 *                 format: date
 *                 example: '2026-04-01'
 *               caretakerId:
 *                 type: string
 *                 description: Legacy assignee field. Used when assigneeId and nurseId are not provided.
 *               nurseId:
 *                 type: string
 *                 description: Legacy assignee field. Used when assigneeId is not provided.
 *               assigneeId:
 *                 type: string
 *                 description: ID of the staff member assigned to this task
 *               priority:
 *                 type: string
 *                 enum: [low, medium, high]
 *                 default: medium
 *                 description: Task priority level
 *     responses:
 *       201:
 *         description: Task created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 task:
 *                   $ref: '#/components/schemas/Task'
 *       500:
 *         description: Error creating task
 */
exports.createTask = async (req, res) => {
  try {
    const { title, description, patientId, dueDate, caretakerId, nurseId, assigneeId, priority } = req.body;
    const assignee = assigneeId || nurseId || caretakerId;

    if (!description || !patientId || !dueDate || !assignee) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const [patient, assignedUser] = await Promise.all([
      Patient.findById(patientId).select('_id').lean(),
      User.findById(assignee).select('_id').lean()
    ]);

    if (!patient) return res.status(404).json({ message: 'Patient not found' });
    if (!assignedUser) return res.status(404).json({ message: 'Assignee not found' });

    const newTask = new Task({
      title: title || description,
      description,
      patient: patientId,
      dueDate,
      assignee,
      priority
    });
    await newTask.save();

    Promise.resolve(
      notifyRules.taskCreated({
        taskId: newTask._id,
        patientId,
        caretaker: newTask.assignee,
        dueDate: newTask.dueDate,
        actorId: req.user?._id
      })
    ).catch(() => { });

    res.status(201).json({ message: 'Task created successfully', task: newTask });
  } catch (error) {
    res.status(500).json({ message: 'Error creating task', details: error.message });
  }
};

/**
 * @swagger
 * /api/v1/admin/tasks/{taskId}:
 *   put:
 *     summary: Update a task
 *     tags: [Admin]
 *     parameters:
 *       - in: path
 *         name: taskId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the task to update
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
 *                 format: date
 *               caretakerId:
 *                 type: string
 *               nurseId:
 *                 type: string
 *               assigneeId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Task updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 task:
 *                   $ref: '#/components/schemas/Task'
 *       404:
 *         description: Task not found
 *       500:
 *         description: Error updating task
 */
exports.updateTask = async (req, res) => {
  try {
    const { taskId } = req.params;
    const { title, description, dueDate, priority, status, report, caretakerId, nurseId, assigneeId, patientId } = req.body;
    const nextAssignee = assigneeId || nurseId || caretakerId;

    if (patientId) {
      const patient = await Patient.findById(patientId).select('_id').lean();
      if (!patient) return res.status(404).json({ message: 'Patient not found' });
    }

    if (nextAssignee) {
      const assignedUser = await User.findById(nextAssignee).select('_id').lean();
      if (!assignedUser) return res.status(404).json({ message: 'Assignee not found' });
    }

    const updateData = {
      ...(title !== undefined && { title }),
      ...(description !== undefined && { description }),
      ...(dueDate !== undefined && { dueDate }),
      ...(priority !== undefined && { priority }),
      ...(status !== undefined && { status }),
      ...(report !== undefined && { report }),
      ...(patientId && { patient: patientId }),
      ...(nextAssignee && { assignee: nextAssignee }),
      updated_at: Date.now()
    };

    const updatedTask = await Task.findByIdAndUpdate(taskId, updateData, { new: true, runValidators: true });


    if (!updatedTask) {
      return res.status(404).json({ message: 'Task not found' });
    }
    Promise.resolve(
      notifyRules.taskUpdated({
        taskId: updatedTask._id,
        patientId: updatedTask.patient,
        caretaker: updatedTask.assignee,
        status: updatedTask.status,
        dueDate: updatedTask.dueDate,
        actorId: req.user?._id
      })
    ).catch(() => { });

    res.status(200).json({ message: 'Task updated successfully', task: updatedTask });
  } catch (error) {
    res.status(500).json({ message: 'Error updating task', details: error.message });
  }
};

/**
 * @swagger
 * /api/v1/admin/tasks/{taskId}:
 *   delete:
 *     summary: Delete a task
 *     tags: [Admin]
 *     parameters:
 *       - in: path
 *         name: taskId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the task to delete
 *     responses:
 *       200:
 *         description: Task deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       404:
 *         description: Task not found
 *       500:
 *         description: Error deleting task
 */
exports.deleteTask = async (req, res) => {
  try {
    const { taskId } = req.params;

    const deletedTask = await Task.findByIdAndDelete(taskId);

    if (!deletedTask) {
      return res.status(404).json({ message: 'Task not found' });
    }
    notifyRules.taskDeleted({
      taskId,
      patientId: deletedTask.patient,
      caretaker: deletedTask.assignee,
      actorId: req.user?._id
    })

    res.status(200).json({ message: 'Task deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting task', details: error.message });
  }
};

// Admin Dashboard Summary API

/**
 * @swagger
 * /api/v1/admin/dashboard-summary:
 *   get:
 *     summary: Get admin dashboard summary
 *     description: >-
 *       Returns a system-wide snapshot for administrators. Includes total and active
 *       patient counts, a staff breakdown by role with pending approval count, a full
 *       task breakdown (total, completed, in-progress, pending, and overdue) across
 *       all staff, task completion rate, and a count of patient logs created
 *       system-wide in the last 7 days. Requires a valid JWT with the **admin** role.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Admin dashboard summary fetched successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalPatients:
 *                   type: integer
 *                   description: Total patients registered in the system (including deleted).
 *                   example: 20
 *                 totalActivePatients:
 *                   type: integer
 *                   description: Active (non-deleted) patients in the system.
 *                   example: 18
 *                 staff:
 *                   type: object
 *                   description: Breakdown of registered staff accounts.
 *                   properties:
 *                     total:
 *                       type: integer
 *                       description: Total staff across all clinical roles (doctors, nurses, caretakers).
 *                       example: 12
 *                     doctors:
 *                       type: integer
 *                       description: Number of users with the doctor role.
 *                       example: 3
 *                     nurses:
 *                       type: integer
 *                       description: Number of users with the nurse role.
 *                       example: 5
 *                     caretakers:
 *                       type: integer
 *                       description: Number of users with the caretaker role.
 *                       example: 4
 *                     pendingApprovals:
 *                       type: integer
 *                       description: Staff accounts with approvalStatus = "pending".
 *                       example: 2
 *                 totalTasks:
 *                   type: integer
 *                   description: Total tasks across all staff and patients in the system.
 *                   example: 45
 *                 completedTasks:
 *                   type: integer
 *                   description: Tasks marked as completed system-wide.
 *                   example: 20
 *                 inProgressTasks:
 *                   type: integer
 *                   description: Tasks currently marked as in progress system-wide.
 *                   example: 8
 *                 pendingTasks:
 *                   type: integer
 *                   description: Tasks not yet started (totalTasks − completed − inProgress).
 *                   example: 17
 *                 overdueTasks:
 *                   type: integer
 *                   description: Incomplete tasks whose due date has already passed, system-wide.
 *                   example: 6
 *                 taskCompletionRate:
 *                   type: integer
 *                   description: Percentage of tasks completed system-wide (0–100).
 *                   example: 44
 *                 recentLogsCount:
 *                   type: integer
 *                   description: Patient log entries created system-wide in the last 7 days.
 *                   example: 14
 *       500:
 *         description: Unexpected server error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 details:
 *                   type: string
 */
exports.getDashboardSummary = async (req, res) => {
  try {
    const now = new Date();
    const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);

    const staffRoleIds = await Role.find({ name: { $in: ['nurse', 'caretaker', 'doctor'] } }).distinct('_id');

    const [
      totalPatients,
      totalActivePatients,
      totalStaff,
      totalDoctors,
      totalNurses,
      totalCaretakers,
      pendingApprovals,
      totalTasks,
      completedTasks,
      inProgressTasks,
      overdueTasks,
      recentLogsCount,
    ] = await Promise.all([
      Patient.countDocuments(),
      Patient.countDocuments({ isDeleted: false }),
      User.countDocuments({ role: { $in: staffRoleIds } }),
      User.countDocuments({ role: (await Role.findOne({ name: 'doctor' }).select('_id').lean())?._id }),
      User.countDocuments({ role: (await Role.findOne({ name: 'nurse' }).select('_id').lean())?._id }),
      User.countDocuments({ role: (await Role.findOne({ name: 'caretaker' }).select('_id').lean())?._id }),
      User.countDocuments({ approvalStatus: 'pending' }),
      Task.countDocuments(),
      Task.countDocuments({ status: 'completed' }),
      Task.countDocuments({ status: 'in progress' }),
      Task.countDocuments({ status: { $ne: 'completed' }, dueDate: { $lt: now } }),
      PatientLog.countDocuments({ createdAt: { $gte: sevenDaysAgo } }),
    ]);

    res.status(200).json({
      totalPatients,
      totalActivePatients,
      staff: {
        total: totalStaff,
        doctors: totalDoctors,
        nurses: totalNurses,
        caretakers: totalCaretakers,
        pendingApprovals,
      },
      totalTasks,
      completedTasks,
      inProgressTasks,
      pendingTasks: totalTasks - completedTasks - inProgressTasks,
      overdueTasks,
      taskCompletionRate: totalTasks ? Math.round((completedTasks / totalTasks) * 100) : 0,
      recentLogsCount,
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching dashboard summary', details: error.message });
  }
};
