const mongoose = require('mongoose');
const CarePlan = require('../models/CarePlan');
const Patient = require('../models/Patient');
const Task = require('../models/Task');
const User = require('../models/User');
const notifyRules = require('../services/notifyRules');
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
  { path: 'provider', select: 'fullname email' }
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

/**
 * Validates and normalizes the care plan's editable fields (description,
 * diagnosis, review date, prescriptions, related appointments) from a
 * request body. Only keys actually present in the body are included in the
 * returned updates object, so partial updates don't clobber existing
 * values.
 */
function validateCarePlanFields(body = {}) {
  const updates = {};

  if (body.description !== undefined) {
    if (typeof body.description !== 'string') {
      return { ok: false, status: 400, message: 'description must be a string' };
    }
    updates.description = body.description.trim();
  }

  if (body.diagnosis !== undefined) {
    if (typeof body.diagnosis !== 'string') {
      return { ok: false, status: 400, message: 'diagnosis must be a string' };
    }
    updates.diagnosis = body.diagnosis.trim();
  }

  if (body.reviewDate !== undefined) {
    if (body.reviewDate !== null && isNaN(Date.parse(body.reviewDate))) {
      return { ok: false, status: 400, message: 'reviewDate must be a valid date or null' };
    }
    updates.reviewDate = body.reviewDate ? new Date(body.reviewDate) : null;
  }

  if (body.prescriptions !== undefined) {
    updates.prescriptions = body.prescriptions;
  }

  if (body.relatedAppointments !== undefined) {
    updates.relatedAppointments = body.relatedAppointments;
  }

  return { ok: true, updates };
}

exports.createCarePlan = async (req, res) => {
  try {
    const { title, patientId, tasks = [] } = req.body || {};

    if (!title || !patientId) {
      return res.status(400).json({ message: 'title and patientId are required' });
    }

    const patientAccess = await getPatientForRequest(req, patientId);
    if (!patientAccess.ok) return res.status(patientAccess.status).json({ message: patientAccess.message });

    const taskAccess = await validateTasksForPatient(tasks, patientId);
    if (!taskAccess.ok) return res.status(taskAccess.status).json({ message: taskAccess.message });

    const fieldsAccess = validateCarePlanFields(req.body);
    if (!fieldsAccess.ok) return res.status(fieldsAccess.status).json({ message: fieldsAccess.message });

    const carePlan = await CarePlan.create({
      title,
      patient: patientId,
      provider: req.user._id,
      tasks,
      ...fieldsAccess.updates
    });

    notify(notifyRules.carePlanCreated({
      carePlanId: carePlan._id,
      patientId,
      authorId: carePlan.provider,
      taskAssigneeIds: getTaskAssigneeIds(taskAccess.tasks),
      actorId: req.user?._id
    }));

    const created = await populateCarePlan(CarePlan.findById(carePlan._id));
    return res.status(201).json({ message: 'Care plan created', carePlan: created });
  } catch (error) {
    return res.status(500).json({ message: 'Error creating care plan', details: error.message });
  }
};

exports.getAllCarePlans = async (req, res) => {
  try {
    const { patientId, providerId, page = '1', limit = '20' } = req.query;
    const scoped = await getScopedPatientFilter(req, patientId);
    if (!scoped.ok) return res.status(scoped.status).json({ message: scoped.message });

    const query = { ...scoped.filter };

    if (providerId) {
      if (!isValidObjectId(providerId)) return res.status(400).json({ message: 'providerId must be a valid ID' });
      query.provider = providerId;
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

    const patientAccess = await getPatientForRequest(req, carePlan.patient._id);
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
    const { title, patientId, patient, tasks } = req.body || {};

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

    const fieldsAccess = validateCarePlanFields(req.body);
    if (!fieldsAccess.ok) return res.status(fieldsAccess.status).json({ message: fieldsAccess.message });

    const updates = { ...fieldsAccess.updates };
    if (title !== undefined) updates.title = title;
    if (patientId || patient) updates.patient = nextPatientId;
    if (tasks !== undefined) updates.tasks = tasks;

    const carePlan = await populateCarePlan(
      CarePlan.findByIdAndUpdate(carePlanId, updates, { new: true, runValidators: true })
    );

    notify(notifyRules.carePlanUpdated({
      carePlanId: carePlan._id,
      patientId: carePlan.patient,
      authorId: carePlan.provider,
      taskAssigneeIds: getTaskAssigneeIds(taskAccess.tasks),
      actorId: req.user?._id
    }));

    return res.status(200).json({ message: 'Care plan updated', carePlan });
  } catch (error) {
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
      authorId: carePlan.provider,
      taskAssigneeIds: getTaskAssigneeIds(carePlan.tasks),
      actorId: req.user?._id
    }));

    return res.status(200).json({ message: 'Care plan deleted' });
  } catch (error) {
    return res.status(500).json({ message: 'Error deleting care plan', details: error.message });
  }
};