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


// ------------------------ Admin create & fetch (RBAC) ------------------------
const Role = require('../models/Role');
const User = require('../models/User');

/**
 * Create a new admin user (admin-only).
 * Strong password policy and safe response (no password hash).
 * POST /api/v1/admin/users
 */

/**
 * @swagger
 * /api/v1/admin/users:
 *   post:
 *     summary: Create a new admin user
 *     description: Creates a new admin with a strong password policy. Response excludes password fields.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AdminCreateRequest'
 *     responses:
 *       201:
 *         description: Admin created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Admin created
 *                 admin:
 *                   $ref: '#/components/schemas/AdminSafe'
 *       409:
 *         description: Email already exists
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       422:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

exports.createAdminUser = async (req, res) => {
  try {
    const { fullname, email, password, org } = req.body || {};
    if (!fullname || !email || !password) {
      return res.status(422).json({ error: 'fullname, email and password are required' });
    }
    const minLen = parseInt(process.env.PASSWORD_MIN_LENGTH || '12', 10);
    const hasLower = /[a-z]/.test(password);
    const hasUpper = /[A-Z]/.test(password);
    const hasNum   = /[0-9]/.test(password);
    const hasSym   = /[^A-Za-z0-9]/.test(password);
    if (!(password.length >= minLen && hasLower && hasUpper && hasNum && hasSym)) {
      return res.status(422).json({ error: `Password must be at least ${minLen} chars and include upper, lower, number, and symbol` });
    }
    const parts = String(email).toLowerCase().split(/[@._-]+/).filter(Boolean);
    const pl = password.toLowerCase();
    if (parts.some(p => p.length >= 3 && pl.includes(p))) {
      return res.status(422).json({ error: 'Password must not contain parts of the email' });
    }

    const existing = await User.findOne({ email: String(email).toLowerCase() }).lean();
    if (existing) return res.status(409).json({ error: 'Email already exists' });

    // Ensure Role('admin') exists
    let adminRole = await Role.findOne({ name: 'admin' });
    if (!adminRole) adminRole = await Role.create({ name: 'admin' });

    const user = new User({
      fullname,
      email: String(email).toLowerCase(),
      password_hash: password, // pre-save hook hashes with bcrypt
      role: adminRole._id
    });
    await user.save();

    return res.status(201).json({
      message: 'Admin created',
      admin: {
        _id: user._id,
        fullname: user.fullname,
        email: user.email,
        role: 'admin',
        lastPasswordChange: user.lastPasswordChange,
        failedLoginAttempts: user.failedLoginAttempts,
        created_at: user.created_at,
        updated_at: user.updated_at
      }
    });
  } catch (err) {
    console.error('createAdminUser error:', err);
    return res.status(500).json({ error: 'Failed to create admin' });
  }
};

/**
 * Get an admin by id (admin-only).
 * GET /api/v1/admin/users/:id
 */

/**
 * @swagger
 * /api/v1/admin/users/{id}:
 *   get:
 *     summary: Get an admin by id
 *     description: Returns a single admin. Response excludes password fields.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: MongoDB ObjectId of the admin
 *     responses:
 *       200:
 *         description: Admin found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 admin:
 *                   $ref: '#/components/schemas/AdminSafe'
 *       400:
 *         description: Invalid id
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */


exports.getAdminById = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id).populate('role');
    if (!user || !user.role || user.role.name !== 'admin') {
      return res.status(404).json({ error: 'Admin not found' });
    }
    return res.status(200).json({
      admin: {
        _id: user._id,
        fullname: user.fullname,
        email: user.email,
        role: 'admin',
        lastPasswordChange: user.lastPasswordChange,
        failedLoginAttempts: user.failedLoginAttempts,
        created_at: user.created_at,
        updated_at: user.updated_at
      }
    });
  } catch (err) {
    return res.status(400).json({ error: 'Invalid id' });
  }
};

/**
 * List admins with basic pagination (admin-only).
 * GET /api/v1/admin/users?limit=20&after=<id>
 */

/**
 * @swagger
 * /api/v1/admin/users:
 *   get:
 *     summary: List admin users
 *     description: Cursor-style pagination using the last returned id as nextCursor.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Page size
 *       - in: query
 *         name: after
 *         schema:
 *           type: string
 *         description: Return items with id greater than this cursor
 *     responses:
 *       200:
 *         description: Admin list
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AdminListResponse'
 *       400:
 *         description: Invalid cursor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */


exports.listAdmins = async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit || '20', 10), 1), 100);
    let after = req.query.after;
    const role = await Role.findOne({ name: 'admin' });
    if (!role) return res.json({ items: [], nextCursor: null, limit });

    const filter = { role: role._id };
    if (after) {
      try {
        after = require('mongoose').Types.ObjectId.createFromHexString(after);
        filter._id = { $gt: after };
      } catch {
        return res.status(400).json({ error: 'Invalid cursor' });
      }
    }

    const items = await User.find(filter).sort({ _id: 1 }).limit(limit);
    const nextCursor = items.length ? items[items.length - 1]._id : null;
    return res.json({
      items: items.map(u => ({
        _id: u._id,
        fullname: u.fullname,
        email: u.email,
        role: 'admin',
        lastPasswordChange: u.lastPasswordChange,
        failedLoginAttempts: u.failedLoginAttempts,
        created_at: u.created_at,
        updated_at: u.updated_at
      })),
      nextCursor,
      limit
    });
  } catch (err) {
    console.error('listAdmins error:', err);
    return res.status(500).json({ error: 'Failed to list admins' });
  }
};

