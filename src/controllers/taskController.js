const Task = require('../models/Task');
const Patient = require('../models/Patient');
const User = require('../models/User');
const Organization = require('../models/Organization');
const mongoose = require('mongoose');
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

function normalizeTextList(value, fieldName) {
  if (value === undefined) return { ok: true, value: undefined };
  const values = Array.isArray(value)
    ? value
    : (typeof value === 'string' ? value.split(',') : null);
  if (!values) {
    return { ok: false, message: `${fieldName} must be an array of text values` };
  }

  if (values.length === 1 && !String(values[0]).trim()) {
    return { ok: true, value: [] };
  }

  const normalized = values.map(item => (typeof item === 'string' ? item.trim() : ''));
  if (normalized.some(item => !item)) {
    return { ok: false, message: `${fieldName} must contain only non-empty text values` };
  }

  return { ok: true, value: [...new Set(normalized)] };
}

function normalizeStaffIds(value) {
  if (value === undefined) return { ok: true, value: undefined };
  const values = Array.isArray(value)
    ? value
    : (typeof value === 'string' ? value.split(',') : null);
  if (!values) {
    return { ok: false, message: 'relatedStaffIds must be an array of user IDs' };
  }

  if (values.length === 1 && !String(values[0]).trim()) {
    return { ok: true, value: [] };
  }

  const normalized = [...new Set(values.map(id => String(id).trim()))];
  if (normalized.some(id => !mongoose.isValidObjectId(id))) {
    return { ok: false, message: 'relatedStaffIds contains an invalid user ID' };
  }

  return { ok: true, value: normalized };
}

async function resolveUserOrganization(user, role, requestedOrganizationId) {
  if (requestedOrganizationId && role === 'admin') {
    const requestedOrganization = await Organization.findOne({
      _id: requestedOrganizationId,
      $or: [{ createdBy: user._id }, { staff: user._id }]
    }).select('_id').lean();
    return requestedOrganization?._id || null;
  }

  if (user.organization) return user.organization;
  if (role !== 'admin') return null;

  const organization = await Organization.findOne({
    $or: [{ createdBy: user._id }, { staff: user._id }]
  }).select('_id').lean();
  return organization?._id || null;
}

async function getRequestUserContext(req) {
  if (req.taskRequestUser) return req.taskRequestUser;

  const user = await User.findById(req.user?._id)
    .select('_id role organization')
    .populate('role', 'name')
    .lean();
  if (!user) return null;

  const role = user.role?.name ? String(user.role.name).toLowerCase() : null;
  const organization = await resolveUserOrganization(user, role, req.query?.orgId);
  req.taskRequestUser = { ...user, roleName: role, organization };
  return req.taskRequestUser;
}

async function getRequestUserRole(req) {
  if (req.userRole) return req.userRole;
  const user = await getRequestUserContext(req);
  return user?.roleName || null;
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

async function getScopedTaskFilter(req, patientId) {
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
  return {
    ok: true,
    filter: {
      $or: [
        { patient: { $in: patientIds } },
        { assignee: req.user._id },
        { relatedStaff: req.user._id },
        { caretaker: req.user._id },
        { nurse_id: req.user._id }
      ]
    }
  };
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

async function validateTaskAssignment(req, patient, assigneeId, { enforceSelfAssignment = true } = {}) {
  const assignee = await User.findById(assigneeId)
    .select('_id role organization')
    .populate('role', 'name')
    .lean();
  if (!assignee) return { ok: false, status: 404, message: 'Assignee not found' };

  const assigneeRole = assignee.role?.name
    ? String(assignee.role.name).toLowerCase()
    : null;
  const allowedRoles = ['admin', 'caretaker', 'nurse', 'doctor'];
  if (!allowedRoles.includes(assigneeRole)) {
    return { ok: false, status: 400, message: 'Assignee must be a staff member' };
  }

  const requester = await getRequestUserContext(req);
  if (!requester) return { ok: false, status: 401, message: 'Authenticated user not found' };

  const requesterRole = requester.roleName;
  const isSelfAssignment = idsEqual(requester._id, assigneeId);

  if (!isSelfAssignment) {
    const assigneeOrganization = await resolveUserOrganization(assignee, assigneeRole);
    if (!requester.organization || !assigneeOrganization ||
        !idsEqual(requester.organization, assigneeOrganization)) {
      return {
        ok: false,
        status: 403,
        message: 'Tasks can only be assigned to users in the same organization'
      };
    }

    if (enforceSelfAssignment && requesterRole === 'doctor' &&
        !['nurse', 'caretaker'].includes(assigneeRole)) {
      return {
        ok: false,
        status: 403,
        message: 'Doctors can only assign tasks to themselves, nurses, or caretakers in their organization'
      };
    }

    if (enforceSelfAssignment && !['admin', 'doctor'].includes(requesterRole)) {
      return {
        ok: false,
        status: 403,
        message: 'Nurses and caretakers can only assign tasks to themselves'
      };
    }
  }

  if (patient && requesterRole !== 'admin' && !patientHasAssignee(patient, assigneeId)) {
    return { ok: false, status: 400, message: 'Assignee must be part of the patient care team' };
  }

  return { ok: true };
}

async function validateRelatedStaff(req, patient, assigneeId, relatedStaffIds) {
  if (relatedStaffIds.some(staffId => idsEqual(staffId, assigneeId))) {
    return {
      ok: false,
      status: 400,
      message: 'The primary assignee must not be repeated in relatedStaffIds'
    };
  }

  for (const staffId of relatedStaffIds) {
    const staffAccess = await validateTaskAssignment(
      req,
      patient,
      staffId,
      { enforceSelfAssignment: false }
    );
    if (!staffAccess.ok) return staffAccess;
  }

  return { ok: true };
}

exports.createTask = async (req, res) => {
  try {
    const {
      title,
      description,
      dueDate,
      priority,
      status,
      patientId,
      assigneeId,
      relatedStaffIds,
      objectives,
      deliverables
    } = req.body;

    if (!title || !description || !dueDate || !assigneeId) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const normalizedRelatedStaff = normalizeStaffIds(relatedStaffIds);
    if (!normalizedRelatedStaff.ok) {
      return res.status(400).json({ message: normalizedRelatedStaff.message });
    }

    const normalizedObjectives = normalizeTextList(objectives, 'objectives');
    if (!normalizedObjectives.ok) {
      return res.status(400).json({ message: normalizedObjectives.message });
    }

    const normalizedDeliverables = normalizeTextList(deliverables, 'deliverables');
    if (!normalizedDeliverables.ok) {
      return res.status(400).json({ message: normalizedDeliverables.message });
    }

    const hasPatient = patientId !== undefined && patientId !== null && patientId !== '';
    let patient = null;
    if (hasPatient) {
      const patientAccess = await getPatientForRequest(req, patientId);
      if (!patientAccess.ok) return res.status(patientAccess.status).json({ message: patientAccess.message });
      patient = patientAccess.patient;
    }

    const assigneeAccess = await validateTaskAssignment(req, patient, assigneeId);
    if (!assigneeAccess.ok) return res.status(assigneeAccess.status).json({ message: assigneeAccess.message });

    const relatedStaffAccess = await validateRelatedStaff(
      req,
      patient,
      assigneeId,
      normalizedRelatedStaff.value || []
    );
    if (!relatedStaffAccess.ok) {
      return res.status(relatedStaffAccess.status).json({ message: relatedStaffAccess.message });
    }

    const task = new Task({
      title,
      description,
      dueDate,
      priority: priority || 'medium',
      status: status || 'pending',
      patient: hasPatient ? patientId : null,
      assignee: assigneeId,
      relatedStaff: normalizedRelatedStaff.value || [],
      objectives: normalizedObjectives.value || [],
      deliverables: normalizedDeliverables.value || [],
      setBy: req.user?._id || req.user?.id || null
    });

    await task.save();

    notify(notifyRules.assigneeTaskCreated({
      taskId: task._id,
      patientId: task.patient,
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
    const {
      title,
      description,
      dueDate,
      priority,
      status,
      report,
      patientId,
      assigneeId,
      relatedStaffIds,
      objectives,
      deliverables
    } = req.body;
    const task = await Task.findById(taskId);

    if (!task) return res.status(404).json({ message: 'Task not found' });

    const requesterRole = await getRequestUserRole(req);
    let currentPatient = null;
    if (task.patient) {
      const currentPatientAccess = await getPatientForRequest(req, task.patient);
      if (!currentPatientAccess.ok) {
        return res.status(currentPatientAccess.status).json({ message: currentPatientAccess.message });
      }
      currentPatient = currentPatientAccess.patient;
    } else if (requesterRole !== 'admin' && !idsEqual(task.assignee, req.user?._id)) {
      return res.status(403).json({ message: 'You do not have access to this task' });
    }

    const updateData = { updated_at: Date.now() };
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (dueDate !== undefined) updateData.dueDate = dueDate;
    if (priority !== undefined) updateData.priority = priority;
    if (status !== undefined) updateData.status = status;
    if (report !== undefined) updateData.report = report;

    const normalizedObjectives = normalizeTextList(objectives, 'objectives');
    if (!normalizedObjectives.ok) {
      return res.status(400).json({ message: normalizedObjectives.message });
    }
    if (normalizedObjectives.value !== undefined) {
      updateData.objectives = normalizedObjectives.value;
    }

    const normalizedDeliverables = normalizeTextList(deliverables, 'deliverables');
    if (!normalizedDeliverables.ok) {
      return res.status(400).json({ message: normalizedDeliverables.message });
    }
    if (normalizedDeliverables.value !== undefined) {
      updateData.deliverables = normalizedDeliverables.value;
    }

    const hasPatientUpdate = Object.prototype.hasOwnProperty.call(req.body, 'patientId');
    const targetPatientId = hasPatientUpdate ? (patientId || null) : task.patient;
    let targetPatient = currentPatient;
    if (hasPatientUpdate) {
      targetPatient = null;
      if (targetPatientId) {
        const targetPatientAccess = await getPatientForRequest(req, targetPatientId);
        if (!targetPatientAccess.ok) {
          return res.status(targetPatientAccess.status).json({ message: targetPatientAccess.message });
        }
        targetPatient = targetPatientAccess.patient;
      }
    }

    const hasAssigneeUpdate = Object.prototype.hasOwnProperty.call(req.body, 'assigneeId');
    if (hasAssigneeUpdate && !assigneeId) {
      return res.status(400).json({ message: 'A task must have one assignee' });
    }

    const targetAssigneeId = assigneeId || task.assignee;
    if (targetAssigneeId && (hasAssigneeUpdate || hasPatientUpdate)) {
      const assigneeAccess = await validateTaskAssignment(
        req,
        targetPatient,
        targetAssigneeId,
        { enforceSelfAssignment: hasAssigneeUpdate }
      );
      if (!assigneeAccess.ok) return res.status(assigneeAccess.status).json({ message: assigneeAccess.message });
    }

    const normalizedRelatedStaff = normalizeStaffIds(relatedStaffIds);
    if (!normalizedRelatedStaff.ok) {
      return res.status(400).json({ message: normalizedRelatedStaff.message });
    }
    const hasRelatedStaffUpdate = normalizedRelatedStaff.value !== undefined;
    const targetRelatedStaffIds = hasRelatedStaffUpdate
      ? normalizedRelatedStaff.value
      : (task.relatedStaff || []);

    if (hasRelatedStaffUpdate || hasPatientUpdate || hasAssigneeUpdate) {
      const relatedStaffAccess = await validateRelatedStaff(
        req,
        targetPatient,
        targetAssigneeId,
        targetRelatedStaffIds
      );
      if (!relatedStaffAccess.ok) {
        return res.status(relatedStaffAccess.status).json({ message: relatedStaffAccess.message });
      }
    }

    if (hasPatientUpdate) updateData.patient = targetPatientId;
    if (hasAssigneeUpdate) updateData.assignee = assigneeId;
    if (hasRelatedStaffUpdate) updateData.relatedStaff = normalizedRelatedStaff.value;

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

    const requesterRole = await getRequestUserRole(req);
    if (task.patient) {
      const patientAccess = await getPatientForRequest(req, task.patient);
      if (!patientAccess.ok) return res.status(patientAccess.status).json({ message: patientAccess.message });
    } else if (requesterRole !== 'admin' && !idsEqual(task.assignee, req.user?._id)) {
      return res.status(403).json({ message: 'You do not have access to this task' });
    }

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
    const scoped = await getScopedTaskFilter(req, patientId);
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
        .populate('relatedStaff', 'fullname email')
        .populate('setBy', 'fullname email')
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
    const scoped = await getScopedTaskFilter(req, patientId);
    if (!scoped.ok) return res.status(scoped.status).json({ message: scoped.message });

    const tasks = await Task.find(scoped.filter)
      .populate('assignee', 'fullname email')
      .populate('relatedStaff', 'fullname email')
      .populate('setBy', 'fullname email')
      .sort({ dueDate: 1 });
    return res.status(200).json(tasks);
  } catch (error) {
    return res.status(500).json({ message: 'Error fetching patient tasks', details: error.message });
  }
};

exports.getTasksByAssignee = async (req, res) => {
  try {
    const { assigneeId } = req.params;
    const scoped = await getScopedTaskFilter(req);
    if (!scoped.ok) return res.status(scoped.status).json({ message: scoped.message });

    const tasks = await Task.find({
      ...scoped.filter,
      $and: [...(scoped.filter.$and || []), taskAssigneeFilter(assigneeId)]
    })
      .populate('patient', 'fullname gender')
      .populate('relatedStaff', 'fullname email')
      .populate('setBy', 'fullname email')
      .sort({ dueDate: 1 });
    return res.status(200).json(tasks);
  } catch (error) {
    return res.status(500).json({ message: 'Error fetching assignee tasks', details: error.message });
  }
};
