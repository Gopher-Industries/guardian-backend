const Task = require('../models/Task');
const Patient = require('../models/Patient');
const User = require('../models/User');
const notifyRules = require('../services/notifyRules');
const {
  getAccessiblePatientIds,
  validateAccessiblePatient
} = require('../utils/patientAccess');

function notify(promise) {
  Promise.resolve(promise).catch(() => {});
}

function idsEqual(left, right) {
  return left && right && String(left) === String(right);
}

async function getRequestUserRole(req) {
  if (req.userRole) return req.userRole;
  const user = await User.findById(req.user?._id).populate('role', 'name').lean();
  return user?.role?.name ? String(user.role.name).toLowerCase() : null;
}

async function getPatientForRequest(req, patientId) {
  const role = await getRequestUserRole(req);

  if (role === 'admin') {
    const patient = await Patient.findOne({ _id: patientId, isDeleted: { $ne: true } })
      .select('_id caretaker assignedNurses assignedDoctor')
      .lean();
    if (!patient) return { ok: false, status: 404, message: 'Patient not found' };
    return { ok: true, patient };
  }

  const access = await validateAccessiblePatient(req.user._id, patientId);
  if (!access.ok) {
    return { ok: false, status: access.status, message: access.error };
  }

  return { ok: true, patient: access.patient };
}

async function getScopedPatientFilter(req, patientId) {
  const role = await getRequestUserRole(req);

  if (role === 'admin') {
    if (!patientId) return { ok: true, filter: {} };
    const patient = await Patient.findOne({ _id: patientId, isDeleted: { $ne: true } }).select('_id').lean();
    if (!patient) return { ok: false, status: 404, message: 'Patient not found' };
    return { ok: true, filter: { patient: patient._id } };
  }

  if (patientId) {
    const access = await validateAccessiblePatient(req.user._id, patientId);
    if (!access.ok) return { ok: false, status: access.status, message: access.error };
    return { ok: true, filter: { patient: access.patient._id } };
  }

  const patientIds = await getAccessiblePatientIds(req.user._id);
  return { ok: true, filter: { patient: { $in: patientIds } } };
}

function patientHasAssignee(patient, assigneeId) {
  return idsEqual(patient.caretaker, assigneeId) ||
    idsEqual(patient.assignedDoctor, assigneeId) ||
    (patient.assignedNurses || []).some(nurseId => idsEqual(nurseId, assigneeId));
}

function taskAssigneeFilter(assigneeId) {
  return {
    $or: [
      { assignee: assigneeId },
      { caretaker: assigneeId },
      { nurse_id: assigneeId }
    ]
  };
}

async function validateAssigneeForPatient(patient, assigneeId) {
  const assignee = await User.findById(assigneeId).select('_id').lean();
  if (!assignee) return { ok: false, status: 404, message: 'Assignee not found' };

  if (!patientHasAssignee(patient, assigneeId)) {
    return { ok: false, status: 400, message: 'Assignee must be part of the patient care team' };
  }

  return { ok: true };
}

exports.createTask = async (req, res) => {
  try {
    const { title, description, dueDate, priority, status, patientId, assigneeId } = req.body;

    if (!title || !description || !dueDate || !patientId || !assigneeId) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const patientAccess = await getPatientForRequest(req, patientId);
    if (!patientAccess.ok) return res.status(patientAccess.status).json({ message: patientAccess.message });

    const assigneeAccess = await validateAssigneeForPatient(patientAccess.patient, assigneeId);
    if (!assigneeAccess.ok) return res.status(assigneeAccess.status).json({ message: assigneeAccess.message });

    const task = new Task({
      title,
      description,
      dueDate,
      priority: priority || 'medium',
      status: status || 'pending',
      patient: patientId,
      assignee: assigneeId
    });

    await task.save();

    notify(notifyRules.assigneeTaskCreated({
      taskId: task._id,
      patientId,
      assigneeId,
      dueDate: task.dueDate,
      actorId: req.user?._id
    }));

    return res.status(201).json({ message: 'Task created', task });
  } catch (error) {
    return res.status(500).json({ message: 'Error creating task', details: error.message });
  }
};

exports.updateTask = async (req, res) => {
  try {
    const { taskId } = req.params;
    const { title, description, dueDate, priority, status, report, patientId, assigneeId } = req.body;
    const task = await Task.findById(taskId);

    if (!task) return res.status(404).json({ message: 'Task not found' });

    const currentPatientAccess = await getPatientForRequest(req, task.patient);
    if (!currentPatientAccess.ok) {
      return res.status(currentPatientAccess.status).json({ message: currentPatientAccess.message });
    }

    const updateData = { updated_at: Date.now() };
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (dueDate !== undefined) updateData.dueDate = dueDate;
    if (priority !== undefined) updateData.priority = priority;
    if (status !== undefined) updateData.status = status;
    if (report !== undefined) updateData.report = report;

    const targetPatientId = patientId || task.patient;
    const targetPatientAccess = patientId
      ? await getPatientForRequest(req, patientId)
      : currentPatientAccess;

    if (!targetPatientAccess.ok) {
      return res.status(targetPatientAccess.status).json({ message: targetPatientAccess.message });
    }

    const targetAssigneeId = assigneeId || task.assignee;
    if (targetAssigneeId) {
      const assigneeAccess = await validateAssigneeForPatient(targetPatientAccess.patient, targetAssigneeId);
      if (!assigneeAccess.ok) return res.status(assigneeAccess.status).json({ message: assigneeAccess.message });
    }

    if (patientId) updateData.patient = targetPatientId;
    if (assigneeId) updateData.assignee = assigneeId;

    const updatedTask = await Task.findByIdAndUpdate(taskId, updateData, { new: true, runValidators: true });

    notify(notifyRules.assigneeTaskUpdated({
      taskId: updatedTask._id,
      patientId: updatedTask.patient,
      assigneeId: updatedTask.assignee,
      status: updatedTask.status,
      dueDate: updatedTask.dueDate,
      actorId: req.user?._id
    }));

    return res.status(200).json({ message: 'Task updated', task: updatedTask });
  } catch (error) {
    return res.status(500).json({ message: 'Error updating task', details: error.message });
  }
};

exports.deleteTask = async (req, res) => {
  try {
    const { taskId } = req.params;
    const task = await Task.findById(taskId);
    if (!task) return res.status(404).json({ message: 'Task not found' });

    const patientAccess = await getPatientForRequest(req, task.patient);
    if (!patientAccess.ok) return res.status(patientAccess.status).json({ message: patientAccess.message });

    await task.deleteOne();

    notify(notifyRules.assigneeTaskDeleted({
      taskId: task._id,
      patientId: task.patient,
      assigneeId: task.assignee,
      actorId: req.user?._id
    }));

    return res.status(200).json({ message: 'Task deleted' });
  } catch (error) {
    return res.status(500).json({ message: 'Error deleting task', details: error.message });
  }
};

exports.getAllTasks = async (req, res) => {
  try {
    const { status, priority, patientId, assigneeId, page = '1', limit = '20' } = req.query;
    const scoped = await getScopedPatientFilter(req, patientId);
    if (!scoped.ok) return res.status(scoped.status).json({ message: scoped.message });

    const query = { ...scoped.filter };

    if (status) query.status = status;
    if (priority) query.priority = priority;
    if (assigneeId) {
      query.$and = [...(query.$and || []), taskAssigneeFilter(assigneeId)];
    }

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
    const skip = (pageNum - 1) * limitNum;

    const [items, total] = await Promise.all([
      Task.find(query)
        .populate('patient', 'fullname gender')
        .populate('assignee', 'fullname email')
        .sort({ dueDate: 1 })
        .skip(skip)
        .limit(limitNum),
      Task.countDocuments(query)
    ]);

    return res.status(200).json({
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum),
      items
    });
  } catch (error) {
    return res.status(500).json({ message: 'Error fetching tasks', details: error.message });
  }
};

exports.getTasksByPatient = async (req, res) => {
  try {
    const { patientId } = req.params;
    const scoped = await getScopedPatientFilter(req, patientId);
    if (!scoped.ok) return res.status(scoped.status).json({ message: scoped.message });

    const tasks = await Task.find(scoped.filter)
      .populate('assignee', 'fullname email')
      .sort({ dueDate: 1 });
    return res.status(200).json(tasks);
  } catch (error) {
    return res.status(500).json({ message: 'Error fetching patient tasks', details: error.message });
  }
};

exports.getTasksByAssignee = async (req, res) => {
  try {
    const { assigneeId } = req.params;
    const scoped = await getScopedPatientFilter(req);
    if (!scoped.ok) return res.status(scoped.status).json({ message: scoped.message });

    const tasks = await Task.find({
      ...scoped.filter,
      $and: [...(scoped.filter.$and || []), taskAssigneeFilter(assigneeId)]
    })
      .populate('patient', 'fullname gender')
      .sort({ dueDate: 1 });
    return res.status(200).json(tasks);
  } catch (error) {
    return res.status(500).json({ message: 'Error fetching assignee tasks', details: error.message });
  }
};
