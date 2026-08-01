const Patient = require('../models/Patient');
const HealthRecord = require('../models/HealthRecord');
const Task = require('../models/Task');
const CarePlan = require('../models/CarePlan');
const User = require('../models/User');
const Role = require('../models/Role');
const mongoose = require('mongoose');
const SupportTicket = require('../models/SupportTicket');
const PatientLog = require('../models/PatientLog');
const notifyRules = require('../services/notifyRules');

const SUPPORT_TICKET_STATUSES = ['open', 'in_progress', 'resolved', 'closed'];
const TASK_STAFF_ROLES = ['admin', 'caretaker', 'nurse', 'doctor'];

function normalizeTaskTextList(value, fieldName) {
  if (value === undefined) return { ok: true, value: undefined };
  if (!Array.isArray(value)) {
    return { ok: false, message: `${fieldName} must be an array of text values` };
  }

  const normalized = value.map(item => (typeof item === 'string' ? item.trim() : ''));
  if (normalized.some(item => !item)) {
    return { ok: false, message: `${fieldName} must contain only non-empty text values` };
  }

  return { ok: true, value: [...new Set(normalized)] };
}

function normalizeRelatedStaffIds(value) {
  if (value === undefined) return { ok: true, value: undefined };
  if (!Array.isArray(value)) {
    return { ok: false, message: 'relatedStaffIds must be an array of user IDs' };
  }

  const normalized = [...new Set(value.map(id => String(id)))];
  if (normalized.some(id => !mongoose.isValidObjectId(id))) {
    return { ok: false, message: 'relatedStaffIds contains an invalid user ID' };
  }

  return { ok: true, value: normalized };
}

async function validateAdminRelatedStaff(relatedStaffIds, assigneeId) {
  if (relatedStaffIds.some(staffId => String(staffId) === String(assigneeId))) {
    return {
      ok: false,
      status: 400,
      message: 'The primary assignee must not be repeated in relatedStaffIds'
    };
  }

  const users = await User.find({ _id: { $in: relatedStaffIds } })
    .select('_id role')
    .populate('role', 'name')
    .lean();

  if (users.length !== relatedStaffIds.length) {
    return { ok: false, status: 404, message: 'Related staff member not found' };
  }

  const invalidRole = users.some(user => {
    const role = user.role?.name ? String(user.role.name).toLowerCase() : null;
    return !TASK_STAFF_ROLES.includes(role);
  });
  if (invalidRole) {
    return { ok: false, status: 400, message: 'Related users must be staff members' };
  }

  return { ok: true };
}

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
 *           description: The one staff member responsible for the task
 *         relatedStaff:
 *           type: array
 *           description: Other staff associated with the task; these users are not additional assignees
 *           items:
 *             type: string
 *         objectives:
 *           type: array
 *           items:
 *             type: string
 *         deliverables:
 *           type: array
 *           description: Optional outputs expected from the task
 *           items:
 *             type: string
 *         setBy:
 *           type: string
 *           description: Authenticated user who set the task
 *         caretaker:
 *           type: string
 *         nurse_id:
 *           type: string
 *         report:
 *           type: string
 *         created_at:
 *           type: string
 *           format: date-time
 *           description: Exact date and time the task was set
 *         updated_at:
 *           type: string
 *           format: date-time
 *     SupportTicket:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *         user:
 *           type: string
 *         subject:
 *           type: string
 *         description:
 *           type: string
 *         status:
 *           type: string
 *           enum: [open, in_progress, resolved, closed]
 *         adminResponse:
 *           type: string
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 *     PaginatedSupportTickets:
 *       type: object
 *       properties:
 *         page:
 *           type: integer
 *         limit:
 *           type: integer
 *         total:
 *           type: integer
 *         totalPages:
 *           type: integer
 *         tickets:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/SupportTicket'
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
      .populate('assignedNurses')
      .lean();

    if (!patientDetails) {
      return res.status(404).json({ message: 'Patient not found' });
    }

    const healthRecords = await HealthRecord.find({ patient: patientId });
    const tasks = await Task.find({ patient: patientId });
    const carePlan = await CarePlan.findOne({ patient: patientId, status: 'active' })
      .sort({ created_at: -1 })
      .populate('tasks')
      .lean();

    const taskCompletionRate = tasks.length
      ? (tasks.filter(task => task.status === 'completed').length / tasks.length) * 100
      : 0;

    return res.status(200).json({
      patient: patientDetails,
      healthRecords,
      carePlan,
      tasks,
      taskCompletionRate,
    });
  } catch (error) {
    return res.status(500).json({
      message: 'Error fetching patient overview',
      details: error.message,
    });
  }
};

/**
 * @swagger
 * /api/v1/admin/support-tickets:
 *   post:
 *     summary: Create a support ticket
 *     tags: [Admin]
 *     requestBody:
 *       required: true
 *     responses:
 *       201:
 *         description: Support ticket created successfully
 *       400:
 *         description: Invalid request body
 *       500:
 *         description: Error creating support ticket
 */
exports.createSupportTicket = async (req, res) => {
  try {
    const { subject, description } = req.body;
    const normalizedSubject = String(subject || '').trim();
    const normalizedDescription = String(description || '').trim();

    if (!normalizedSubject || !normalizedDescription) {
      return res.status(400).json({
        message: 'subject and description are required',
      });
    }

    const newTicket = new SupportTicket({
      user: req.user._id,
      subject: normalizedSubject,
      description: normalizedDescription,
    });

    await newTicket.save();

    Promise.resolve(
      notifyRules.supportTicketCreated({
        ticketId: newTicket._id,
        userId: newTicket.user,
        actorId: req.user?._id,
      })
    ).catch(() => {});

    return res.status(201).json({
      message: 'Support ticket created',
      ticket: newTicket,
    });
  } catch (error) {
    return res.status(500).json({
      message: 'Error creating support ticket',
      details: error.message,
    });
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
 *         description: Filter tickets by status
 *       - in: query
 *         name: userId
 *         required: false
 *         schema:
 *           type: string
 *         description: Filter tickets by user ID
 *       - in: query
 *         name: page
 *         required: false
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         required: false
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of tickets per page
 *     responses:
 *       200:
 *         description: List of support tickets
 *       400:
 *         description: Invalid query parameters
 *       500:
 *         description: Error fetching support tickets
 */
exports.getSupportTickets = async (req, res) => {
  try {
    const { status, userId } = req.query;
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(
      Math.max(parseInt(req.query.limit, 10) || 10, 1),
      100
    );

    const query = {};

    if (status) {
      if (!SUPPORT_TICKET_STATUSES.includes(status)) {
        return res.status(400).json({
          message: `status must be one of: ${SUPPORT_TICKET_STATUSES.join(', ')}`,
        });
      }
      query.status = status;
    }

    if (userId) {
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(400).json({ message: 'Invalid userId filter' });
      }
      query.user = userId;
    }

    const [tickets, total] = await Promise.all([
      SupportTicket.find(query)
        .populate('user', 'fullname email role')
        .sort({ created_at: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      SupportTicket.countDocuments(query),
    ]);

    return res.status(200).json({
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
      tickets,
    });
  } catch (error) {
    return res.status(500).json({
      message: 'Error fetching support tickets',
      details: error.message,
    });
  }
};

/**
 * @swagger
 * /api/v1/admin/support-tickets/{ticketId}:
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
 *     responses:
 *       200:
 *         description: Support ticket updated successfully
 *       400:
 *         description: Invalid ticket ID or empty update body
 *       404:
 *         description: Support ticket not found
 *       500:
 *         description: Error updating support ticket
 */
exports.updateSupportTicket = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { status, adminResponse } = req.body;

    if (!mongoose.Types.ObjectId.isValid(ticketId)) {
      return res.status(400).json({ message: 'Invalid ticketId' });
    }

    const updateData = {};

    if (status !== undefined) {
      if (!SUPPORT_TICKET_STATUSES.includes(status)) {
        return res.status(400).json({
          message: `status must be one of: ${SUPPORT_TICKET_STATUSES.join(', ')}`,
        });
      }
      updateData.status = status;
    }

    if (adminResponse !== undefined) {
      updateData.adminResponse = String(adminResponse).trim();
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        message: 'Provide at least one field to update',
      });
    }

    const updatedTicket = await SupportTicket.findByIdAndUpdate(
      ticketId,
      updateData,
      { new: true, runValidators: true }
    );

    if (!updatedTicket) {
      return res.status(404).json({ message: 'Support ticket not found' });
    }

    Promise.resolve(
      notifyRules.supportTicketUpdated({
        ticketId: updatedTicket._id,
        userId: updatedTicket.user,
        status: updatedTicket.status,
        actorId: req.user?._id,
      })
    ).catch(() => {});

    return res.status(200).json({
      message: 'Support ticket updated',
      ticket: updatedTicket,
    });
  } catch (error) {
    return res.status(500).json({
      message: 'Error updating support ticket',
      details: error.message,
    });
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
 *                 nullable: true
 *                 description: Optional ID of the patient this task is for
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
 *                 description: ID of the one staff member responsible for this task
 *               relatedStaffIds:
 *                 type: array
 *                 description: Optional IDs of other staff associated with the task
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
 *               priority:
 *                 type: string
 *                 enum: [low, medium, high]
 *                 default: medium
 *                 description: Task priority level
 *     responses:
 *       201:
 *         description: Task created successfully. The response includes setBy and created_at.
 *       500:
 *         description: Error creating task
 */
exports.createTask = async (req, res) => {
  try {
    const {
      title,
      description,
      patientId,
      dueDate,
      caretakerId,
      nurseId,
      assigneeId,
      priority,
      relatedStaffIds,
      objectives,
      deliverables
    } = req.body;
    const assignee = assigneeId || nurseId || caretakerId;

    if (!description || !dueDate || !assignee) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const normalizedRelatedStaff = normalizeRelatedStaffIds(relatedStaffIds);
    if (!normalizedRelatedStaff.ok) {
      return res.status(400).json({ message: normalizedRelatedStaff.message });
    }

    const normalizedObjectives = normalizeTaskTextList(objectives, 'objectives');
    if (!normalizedObjectives.ok) {
      return res.status(400).json({ message: normalizedObjectives.message });
    }

    const normalizedDeliverables = normalizeTaskTextList(deliverables, 'deliverables');
    if (!normalizedDeliverables.ok) {
      return res.status(400).json({ message: normalizedDeliverables.message });
    }

    const [patient, assignedUser] = await Promise.all([
      patientId
        ? Patient.findById(patientId).select('_id').lean()
        : Promise.resolve(null),
      User.findById(assignee).select('_id').lean()
    ]);

    if (patientId && !patient) return res.status(404).json({ message: 'Patient not found' });
    if (!assignedUser) return res.status(404).json({ message: 'Assignee not found' });

    const relatedStaffAccess = await validateAdminRelatedStaff(
      normalizedRelatedStaff.value || [],
      assignee
    );
    if (!relatedStaffAccess.ok) {
      return res.status(relatedStaffAccess.status).json({ message: relatedStaffAccess.message });
    }

    const newTask = new Task({
      title: title || description,
      description,
      patient: patientId || null,
      dueDate,
      assignee,
      priority,
      relatedStaff: normalizedRelatedStaff.value || [],
      objectives: normalizedObjectives.value || [],
      deliverables: normalizedDeliverables.value || [],
      setBy: req.user?._id || req.user?.id || null
    });
    await newTask.save();

    Promise.resolve(
      notifyRules.taskCreated({
        taskId: newTask._id,
        patientId,
        caretaker: newTask.assignee,
        dueDate: newTask.dueDate,
        actorId: req.user?._id,
      })
    ).catch(() => {});

    return res.status(201).json({
      message: 'Task created successfully',
      task: newTask,
    });
  } catch (error) {
    return res.status(500).json({
      message: 'Error creating task',
      details: error.message,
    });
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
 *               patientId:
 *                 type: string
 *                 nullable: true
 *                 description: Set to null to remove the patient from the task
 *               caretakerId:
 *                 type: string
 *               nurseId:
 *                 type: string
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
 *         description: Task updated successfully
 *       404:
 *         description: Task not found
 *       500:
 *         description: Error updating task
 */
exports.updateTask = async (req, res) => {
  try {
    const { taskId } = req.params;
    const {
      title,
      description,
      dueDate,
      priority,
      status,
      report,
      caretakerId,
      nurseId,
      assigneeId,
      patientId,
      relatedStaffIds,
      objectives,
      deliverables
    } = req.body;
    const nextAssignee = assigneeId || nurseId || caretakerId;
    const hasPatientUpdate = Object.prototype.hasOwnProperty.call(req.body, 'patientId');
    const existingTask = await Task.findById(taskId).select('assignee relatedStaff').lean();

    if (!existingTask) {
      return res.status(404).json({ message: 'Task not found' });
    }

    const normalizedRelatedStaff = normalizeRelatedStaffIds(relatedStaffIds);
    if (!normalizedRelatedStaff.ok) {
      return res.status(400).json({ message: normalizedRelatedStaff.message });
    }

    const normalizedObjectives = normalizeTaskTextList(objectives, 'objectives');
    if (!normalizedObjectives.ok) {
      return res.status(400).json({ message: normalizedObjectives.message });
    }

    const normalizedDeliverables = normalizeTaskTextList(deliverables, 'deliverables');
    if (!normalizedDeliverables.ok) {
      return res.status(400).json({ message: normalizedDeliverables.message });
    }

    if (hasPatientUpdate && patientId) {
      const patient = await Patient.findById(patientId).select('_id').lean();
      if (!patient) return res.status(404).json({ message: 'Patient not found' });
    }

    if (nextAssignee) {
      const assignedUser = await User.findById(nextAssignee).select('_id').lean();
      if (!assignedUser) return res.status(404).json({ message: 'Assignee not found' });
    }

    const targetAssignee = nextAssignee || existingTask.assignee;
    const targetRelatedStaff = normalizedRelatedStaff.value !== undefined
      ? normalizedRelatedStaff.value
      : (existingTask.relatedStaff || []);
    if (normalizedRelatedStaff.value !== undefined || nextAssignee) {
      const relatedStaffAccess = await validateAdminRelatedStaff(
        targetRelatedStaff,
        targetAssignee
      );
      if (!relatedStaffAccess.ok) {
        return res.status(relatedStaffAccess.status).json({ message: relatedStaffAccess.message });
      }
    }

    const updateData = {
      ...(title !== undefined && { title }),
      ...(description !== undefined && { description }),
      ...(dueDate !== undefined && { dueDate }),
      ...(priority !== undefined && { priority }),
      ...(status !== undefined && { status }),
      ...(report !== undefined && { report }),
      ...(hasPatientUpdate && { patient: patientId || null }),
      ...(nextAssignee && { assignee: nextAssignee }),
      ...(normalizedRelatedStaff.value !== undefined && { relatedStaff: normalizedRelatedStaff.value }),
      ...(normalizedObjectives.value !== undefined && { objectives: normalizedObjectives.value }),
      ...(normalizedDeliverables.value !== undefined && { deliverables: normalizedDeliverables.value }),
      updated_at: Date.now()
    };

    const updatedTask = await Task.findByIdAndUpdate(taskId, updateData, { new: true, runValidators: true });

    Promise.resolve(
      notifyRules.taskUpdated({
        taskId: updatedTask._id,
        patientId: updatedTask.patient,
        caretaker: updatedTask.assignee,
        status: updatedTask.status,
        dueDate: updatedTask.dueDate,
        actorId: req.user?._id,
      })
    ).catch(() => {});

    return res.status(200).json({
      message: 'Task updated successfully',
      task: updatedTask,
    });
  } catch (error) {
    return res.status(500).json({
      message: 'Error updating task',
      details: error.message,
    });
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

    Promise.resolve(
      notifyRules.taskDeleted({
        taskId,
        patientId: deletedTask.patient,
        caretaker: deletedTask.assignee || deletedTask.caretaker,
        nurse: deletedTask.nurse_id,
        actorId: req.user?._id,
      })
    ).catch(() => {});

    return res.status(200).json({
      message: 'Task deleted successfully',
    });
  } catch (error) {
    return res.status(500).json({
      message: 'Error deleting task',
      details: error.message,
    });
  }
};

/**
 * @swagger
 * /api/v1/admin/dashboard-summary:
 *   get:
 *     summary: Get admin dashboard summary
 *     description: >-
 *       Returns a system-wide snapshot for administrators. Includes total and active
 *       patient counts, a staff breakdown by role with pending approval count, a full
 *       task breakdown, task completion rate, and a count of patient logs created
 *       system-wide in the last 7 days.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Admin dashboard summary fetched successfully.
 *       500:
 *         description: Unexpected server error.
 */
exports.getDashboardSummary = async (req, res) => {
  try {
    const now = new Date();
    const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);

    const [doctorRole, nurseRole, caretakerRole] = await Promise.all([
      Role.findOne({ name: 'doctor' }).select('_id').lean(),
      Role.findOne({ name: 'nurse' }).select('_id').lean(),
      Role.findOne({ name: 'caretaker' }).select('_id').lean(),
    ]);

    const staffRoleIds = [
      doctorRole?._id,
      nurseRole?._id,
      caretakerRole?._id,
    ].filter(Boolean);

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
      User.countDocuments({ role: doctorRole?._id }),
      User.countDocuments({ role: nurseRole?._id }),
      User.countDocuments({ role: caretakerRole?._id }),
      User.countDocuments({ approvalStatus: 'pending' }),
      Task.countDocuments(),
      Task.countDocuments({ status: 'completed' }),
      Task.countDocuments({ status: 'in progress' }),
      Task.countDocuments({
        status: { $ne: 'completed' },
        dueDate: { $lt: now },
      }),
      PatientLog.countDocuments({
        createdAt: { $gte: sevenDaysAgo },
      }),
    ]);

    return res.status(200).json({
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
      taskCompletionRate: totalTasks
        ? Math.round((completedTasks / totalTasks) * 100)
        : 0,
      recentLogsCount,
    });
  } catch (error) {
    return res.status(500).json({
      message: 'Error fetching dashboard summary',
      details: error.message,
    });
  }
};
