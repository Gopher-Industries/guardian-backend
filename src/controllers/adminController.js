const Patient = require('../models/Patient');
const HealthRecord = require('../models/HealthRecord');
const Task = require('../models/Task');
const CarePlan = require('../models/CarePlan');
//const SupportTicket = require('../models/SupportTicket');
const notifyRules = require('../services/notifyRules');

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
      .populate('assignedCaretaker')
      .populate('assignedNurse');

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
    ).catch(() => {});
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
    ).catch(() => {});
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
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - description
 *               - patientId
 *               - dueDate
 *               - assignedTo
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               patientId:
 *                 type: string
 *                 description: ID of the patient to whom the task is assigned
 *               dueDate:
 *                 type: string
 *                 format: date
 *               assignedTo:
 *                 type: string
 *                 description: ID of the user (caretaker or nurse) assigned to the task
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
    const { title, description, patientId, dueDate, assignedTo } = req.body;

    const newTask = new Task({ title, description, patient: patientId, dueDate, assignedTo });
    await newTask.save();
    Promise.resolve(
      notifyRules.taskCreated({
        taskId: newTask._id,
        patientId,
        assignedTo: newTask.assignedTo,
        dueDate: newTask.dueDate,
        actorId: req.user?._id
      })
    ).catch(() => {});

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
 *               assignedTo:
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
    const updateData = req.body;

    const updatedTask = await Task.findByIdAndUpdate(taskId, updateData, { new: true });

    if (!updatedTask) {
      return res.status(404).json({ message: 'Task not found' });
    }
    Promise.resolve(
      notifyRules.taskUpdated({
        taskId: updatedTask._id,
        patientId: updatedTask.patient,
        assignedTo: updatedTask.assignedTo,
        status: updatedTask.status,
        dueDate: updatedTask.dueDate,
        actorId: req.user?._id
      })
    ).catch(() => {});

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
    Promise.resolve(
      notifyRules.taskDeleted({
        taskId,
        patientId: deletedTask.patient,
        assignedTo: deletedTask.assignedTo,
        actorId: req.user?._id
      })
       ).catch(() => {});

    res.status(200).json({ message: 'Task deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting task', details: error.message });
  }
};
