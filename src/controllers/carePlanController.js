const mongoose = require('mongoose');
const CarePlan = require('../models/CarePlan');
const Patient = require('../models/Patient');
const Task = require('../models/Task');
const User = require('../models/User');
const notifyRules = require('../services/notifyRules');
const { ensureUserWithRole } = require('../services/userService');
const {
  getAccessiblePatientIds,
  validateAccessiblePatient
} = require('../utils/patientAccess');

const POPULATE_OPTIONS = [
  {
    path: 'tasks',
    populate: {
      path: 'assignee',
      select: 'fullname email'
    }
  },
  { path: 'patient', select: 'fullname gender dateOfBirth caretaker assignedNurses' },
  { path: 'author', select: 'fullname email' },
  { path: 'caretaker', select: 'fullname email' },
  { path: 'nurse', select: 'fullname email' }
];

function isValidObjectId(value) {
  return mongoose.Types.ObjectId.isValid(String(value || ''));
}

function notify(promise) {
  Promise.resolve(promise).catch(() => {});
}

function populateCarePlan(query) {
  POPULATE_OPTIONS.forEach(option => query.populate(option));
  return query;
}

function getTaskAssigneeIds(tasks = []) {
  return tasks.map(task => task.assignee).filter(Boolean);
}

async function getRequestUserRole(req) {
  if (req.userRole) return String(req.userRole).toLowerCase();
  const user = await User.findById(req.user?._id).populate('role', 'name').lean();
  return user?.role?.name ? String(user.role.name).toLowerCase() : null;
}

async function getPatientForRequest(req, patientId) {
  if (!isValidObjectId(patientId)) {
    return { ok: false, status: 400, message: 'patientId must be a valid ID' };
  }

  const role = await getRequestUserRole(req);
  if (role === 'admin') {
    const patient = await Patient.findOne({ _id: patientId, isDeleted: { $ne: true } })
      .select('_id caretaker assignedNurses')
      .lean();

    if (!patient) return { ok: false, status: 404, message: 'Patient not found' };
    return { ok: true, patient };
  }

  const access = await validateAccessiblePatient(req.user._id, patientId);
  if (!access.ok) {
    return { ok: false, status: access.status, message: access.error };
  }

  const patient = await Patient.findById(access.patient._id)
    .select('_id caretaker assignedNurses')
    .lean();
  return { ok: true, patient };
}

async function getScopedPatientFilter(req, patientId) {
  const role = await getRequestUserRole(req);

  if (role === 'admin') {
    if (!patientId) return { ok: true, filter: {} };
    const patientAccess = await getPatientForRequest(req, patientId);
    if (!patientAccess.ok) return patientAccess;
    return { ok: true, filter: { patient: patientAccess.patient._id } };
  }

  if (patientId) {
    const access = await validateAccessiblePatient(req.user._id, patientId);
    if (!access.ok) return { ok: false, status: access.status, message: access.error };
    return { ok: true, filter: { patient: access.patient._id } };
  }

  const patientIds = await getAccessiblePatientIds(req.user._id);
  return { ok: true, filter: { patient: { $in: patientIds } } };
}

async function validateTasksForPatient(taskIds = [], patientId) {
  if (!Array.isArray(taskIds)) {
    return { ok: false, status: 400, message: 'tasks must be an array' };
  }

  if (!taskIds.length) return { ok: true, tasks: [] };

  if (!taskIds.every(isValidObjectId)) {
    return { ok: false, status: 400, message: 'tasks must contain valid task IDs' };
  }

  const tasks = await Task.find({ _id: { $in: taskIds } })
    .select('_id patient assignee')
    .lean();

  if (tasks.length !== taskIds.length) {
    return { ok: false, status: 400, message: 'One or more tasks do not exist' };
  }

  const hasWrongPatient = tasks.some(task => String(task.patient) !== String(patientId));
  if (hasWrongPatient) {
    return { ok: false, status: 400, message: 'All care plan tasks must belong to the care plan patient' };
  }

  return { ok: true, tasks };
}

async function validateCareTeam({ patient, caretakerId, nurseId }) {
  const nextCaretakerId = caretakerId || patient.caretaker;

  if (!nextCaretakerId) {
    return { ok: false, status: 400, message: 'caretakerId is required when the patient has no caretaker' };
  }

  if (!isValidObjectId(nextCaretakerId)) {
    return { ok: false, status: 400, message: 'caretakerId must be a valid ID' };
  }

  const caretaker = await ensureUserWithRole(nextCaretakerId, 'caretaker');
  if (!caretaker) {
    return { ok: false, status: 400, message: 'caretakerId must reference a caretaker user' };
  }

  let nurse = null;
  if (nurseId !== undefined && nurseId !== null) {
    if (!isValidObjectId(nurseId)) {
      return { ok: false, status: 400, message: 'nurseId must be a valid ID or null' };
    }

    nurse = await ensureUserWithRole(nurseId, 'nurse');
    if (!nurse) {
      return { ok: false, status: 400, message: 'nurseId must reference a nurse user' };
    }
  }

  return {
    ok: true,
    caretakerId: caretaker._id,
    nurseId: nurse ? nurse._id : nurseId === null ? null : undefined
  };
}

async function ensureNoOtherActivePlan(patientId, carePlanId = null) {
  const query = { patient: patientId, status: 'active' };
  if (carePlanId) query._id = { $ne: carePlanId };

  const existingActivePlan = await CarePlan.findOne(query).select('_id').lean();
  if (!existingActivePlan) return { ok: true };

  return {
    ok: false,
    status: 409,
    message: carePlanId
      ? 'Another active care plan already exists for this patient'
      : 'An active care plan already exists for this patient',
    carePlanId: existingActivePlan._id
  };
}

exports.createCarePlan = async (req, res) => {
  try {
    const {
      title,
      description = '',
      patientId,
      caretakerId,
      nurseId = null,
      tasks = [],
      status = 'active'
    } = req.body || {};

    if (!title || !patientId) {
      return res.status(400).json({ message: 'title and patientId are required' });
    }

    if (!['active', 'inactive'].includes(status)) {
      return res.status(400).json({ message: 'status must be active or inactive' });
    }

    const patientAccess = await getPatientForRequest(req, patientId);
    if (!patientAccess.ok) return res.status(patientAccess.status).json({ message: patientAccess.message });

    const careTeam = await validateCareTeam({ patient: patientAccess.patient, caretakerId, nurseId });
    if (!careTeam.ok) return res.status(careTeam.status).json({ message: careTeam.message });

    const taskAccess = await validateTasksForPatient(tasks, patientId);
    if (!taskAccess.ok) return res.status(taskAccess.status).json({ message: taskAccess.message });

    if (status === 'active') {
      const activePlan = await ensureNoOtherActivePlan(patientId);
      if (!activePlan.ok) {
        return res.status(activePlan.status).json({
          message: activePlan.message,
          carePlanId: activePlan.carePlanId
        });
      }
    }

    const carePlan = await CarePlan.create({
      title,
      description,
      patient: patientId,
      author: req.user._id,
      caretaker: careTeam.caretakerId,
      nurse: careTeam.nurseId ?? null,
      tasks,
      status
    });

    notify(notifyRules.carePlanCreated({
      carePlanId: carePlan._id,
      patientId,
      authorId: carePlan.author,
      taskAssigneeIds: getTaskAssigneeIds(taskAccess.tasks),
      actorId: req.user?._id
    }));

    const created = await populateCarePlan(CarePlan.findById(carePlan._id));
    return res.status(201).json({ message: 'Care plan created', carePlan: created });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'An active care plan already exists for this patient' });
    }
    return res.status(500).json({ message: 'Error creating care plan', details: error.message });
  }
};

exports.getAllCarePlans = async (req, res) => {
  try {
    const { patientId, authorId, status, page = '1', limit = '20' } = req.query;
    const scoped = await getScopedPatientFilter(req, patientId);
    if (!scoped.ok) return res.status(scoped.status).json({ message: scoped.message });

    const query = { ...scoped.filter };

    if (authorId) {
      if (!isValidObjectId(authorId)) return res.status(400).json({ message: 'authorId must be a valid ID' });
      query.author = authorId;
    }

    if (status) {
      if (!['active', 'inactive'].includes(status)) {
        return res.status(400).json({ message: 'status must be active or inactive' });
      }
      query.status = status;
    }

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
    const skip = (pageNum - 1) * limitNum;

    const [items, total] = await Promise.all([
      populateCarePlan(
        CarePlan.find(query)
          .sort({ created_at: -1 })
          .skip(skip)
          .limit(limitNum)
      ),
      CarePlan.countDocuments(query)
    ]);

    return res.status(200).json({
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum),
      items
    });
  } catch (error) {
    return res.status(500).json({ message: 'Error fetching care plans', details: error.message });
  }
};

exports.getCarePlans = exports.getAllCarePlans;

exports.getCarePlanById = async (req, res) => {
  try {
    const { carePlanId } = req.params;
    if (!isValidObjectId(carePlanId)) {
      return res.status(400).json({ message: 'carePlanId must be a valid ID' });
    }

    const carePlan = await populateCarePlan(CarePlan.findById(carePlanId));
    if (!carePlan) return res.status(404).json({ message: 'Care plan not found' });

    const patientAccess = await getPatientForRequest(req, carePlan.patient);
    if (!patientAccess.ok) return res.status(patientAccess.status).json({ message: patientAccess.message });

    return res.status(200).json({ carePlan });
  } catch (error) {
    return res.status(500).json({ message: 'Error fetching care plan', details: error.message });
  }
};

exports.getCarePlanByPatient = async (req, res) => {
  try {
    const { patientId } = req.params;
    const scoped = await getScopedPatientFilter(req, patientId);
    if (!scoped.ok) return res.status(scoped.status).json({ message: scoped.message });

    const carePlans = await populateCarePlan(
      CarePlan.find(scoped.filter).sort({ created_at: -1 })
    );

    return res.status(200).json(carePlans);
  } catch (error) {
    return res.status(500).json({ message: 'Error fetching care plan', details: error.message });
  }
};

exports.updateCarePlan = async (req, res) => {
  try {
    const { carePlanId } = req.params;
    const {
      title,
      description,
      patientId,
      patient,
      caretakerId,
      nurseId,
      tasks,
      status
    } = req.body || {};

    if (!isValidObjectId(carePlanId)) {
      return res.status(400).json({ message: 'carePlanId must be a valid ID' });
    }

    const existingCarePlan = await CarePlan.findById(carePlanId);
    if (!existingCarePlan) return res.status(404).json({ message: 'Care plan not found' });

    const currentPatientAccess = await getPatientForRequest(req, existingCarePlan.patient);
    if (!currentPatientAccess.ok) {
      return res.status(currentPatientAccess.status).json({ message: currentPatientAccess.message });
    }

    const nextPatientId = patientId || patient || existingCarePlan.patient;
    const nextPatientAccess = (patientId || patient)
      ? await getPatientForRequest(req, nextPatientId)
      : currentPatientAccess;

    if (!nextPatientAccess.ok) {
      return res.status(nextPatientAccess.status).json({ message: nextPatientAccess.message });
    }

    const nextTasks = tasks === undefined ? existingCarePlan.tasks : tasks;
    const taskAccess = await validateTasksForPatient(nextTasks || [], nextPatientId);
    if (!taskAccess.ok) return res.status(taskAccess.status).json({ message: taskAccess.message });

    const updates = {};
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (patientId || patient) updates.patient = nextPatientId;
    if (tasks !== undefined) updates.tasks = tasks;

    if (caretakerId !== undefined || nurseId !== undefined || patientId || patient) {
      const careTeam = await validateCareTeam({
        patient: nextPatientAccess.patient,
        caretakerId: caretakerId === undefined ? existingCarePlan.caretaker : caretakerId,
        nurseId: nurseId === undefined ? existingCarePlan.nurse : nurseId
      });
      if (!careTeam.ok) return res.status(careTeam.status).json({ message: careTeam.message });

      updates.caretaker = careTeam.caretakerId;
      if (nurseId !== undefined || patientId || patient) {
        updates.nurse = careTeam.nurseId ?? null;
      }
    }

    if (status !== undefined) {
      if (!['active', 'inactive'].includes(status)) {
        return res.status(400).json({ message: 'status must be active or inactive' });
      }
      updates.status = status;
    }

    const nextStatus = updates.status || existingCarePlan.status;
    if (nextStatus === 'active') {
      const activePlan = await ensureNoOtherActivePlan(nextPatientId, existingCarePlan._id);
      if (!activePlan.ok) {
        return res.status(activePlan.status).json({
          message: activePlan.message,
          carePlanId: activePlan.carePlanId
        });
      }
    }

    const carePlan = await populateCarePlan(
      CarePlan.findByIdAndUpdate(carePlanId, updates, { new: true, runValidators: true })
    );

    notify(notifyRules.carePlanUpdated({
      carePlanId: carePlan._id,
      patientId: carePlan.patient,
      authorId: carePlan.author,
      taskAssigneeIds: getTaskAssigneeIds(taskAccess.tasks),
      actorId: req.user?._id
    }));

    return res.status(200).json({ message: 'Care plan updated', carePlan });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'Another active care plan already exists for this patient' });
    }
    return res.status(500).json({ message: 'Error updating care plan', details: error.message });
  }
};

exports.deleteCarePlan = async (req, res) => {
  try {
    const { carePlanId } = req.params;
    if (!isValidObjectId(carePlanId)) {
      return res.status(400).json({ message: 'carePlanId must be a valid ID' });
    }

    const carePlan = await CarePlan.findById(carePlanId).populate('tasks');
    if (!carePlan) return res.status(404).json({ message: 'Care plan not found' });

    const patientAccess = await getPatientForRequest(req, carePlan.patient);
    if (!patientAccess.ok) return res.status(patientAccess.status).json({ message: patientAccess.message });

    await carePlan.deleteOne();

    notify(notifyRules.carePlanDeleted({
      carePlanId: carePlan._id,
      patientId: carePlan.patient,
      authorId: carePlan.author,
      taskAssigneeIds: getTaskAssigneeIds(carePlan.tasks),
      actorId: req.user?._id
    }));

    return res.status(200).json({ message: 'Care plan deleted' });
  } catch (error) {
    return res.status(500).json({ message: 'Error deleting care plan', details: error.message });
  }
};
