const CarePlan = require('../models/CarePlan');
const Patient = require('../models/Patient');
const Task = require('../models/Task');
const User = require('../models/User');
const notifyRules = require('../services/notifyRules');
const {
  getAccessiblePatientIds,
  validateAccessiblePatient
} = require('../utils/patientAccess');

function notify(promise) {
  Promise.resolve(promise).catch(() => {});
}

function getTaskAssigneeIds(tasks = []) {
  return tasks.map(task => task.assignee).filter(Boolean);
}

async function getRequestUserRole(req) {
  if (req.userRole) return req.userRole;
  const user = await User.findById(req.user?._id).populate('role', 'name').lean();
  return user?.role?.name ? String(user.role.name).toLowerCase() : null;
}

async function getPatientForRequest(req, patientId) {
  const role = await getRequestUserRole(req);

  if (role === 'admin') {
    const patient = await Patient.findOne({ _id: patientId, isDeleted: { $ne: true } }).select('_id').lean();
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

async function validateTasksForPatient(taskIds = [], patientId) {
  if (!Array.isArray(taskIds)) {
    return { ok: false, status: 400, message: 'tasks must be an array' };
  }

  if (!taskIds.length) return { ok: true, tasks: [] };

  const tasks = await Task.find({ _id: { $in: taskIds } }).select('_id patient assignee').lean();
  if (tasks.length !== taskIds.length) {
    return { ok: false, status: 400, message: 'One or more tasks do not exist' };
  }

  const hasWrongPatient = tasks.some(task => String(task.patient) !== String(patientId));
  if (hasWrongPatient) {
    return { ok: false, status: 400, message: 'All care plan tasks must belong to the care plan patient' };
  }

  return { ok: true, tasks };
}

exports.createCarePlan = async (req, res) => {
  try {
    const { title, patientId, tasks } = req.body;
    const authorId = req.user._id;

    if (!title || !patientId) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const patientAccess = await getPatientForRequest(req, patientId);
    if (!patientAccess.ok) return res.status(patientAccess.status).json({ message: patientAccess.message });

    const taskAccess = await validateTasksForPatient(tasks || [], patientId);
    if (!taskAccess.ok) return res.status(taskAccess.status).json({ message: taskAccess.message });

    const carePlan = new CarePlan({
      title,
      patient: patientId,
      author: authorId,
      tasks: tasks || []
    });

    await carePlan.save();

    notify(notifyRules.carePlanCreated({
      carePlanId: carePlan._id,
      patientId,
      authorId,
      taskAssigneeIds: getTaskAssigneeIds(taskAccess.tasks),
      actorId: req.user?._id
    }));

    return res.status(201).json({ message: 'Care plan created', carePlan });
  } catch (error) {
    return res.status(500).json({ message: 'Error creating care plan', details: error.message });
  }
};

exports.updateCarePlan = async (req, res) => {
  try {
    const { carePlanId } = req.params;
    const { title, patientId, patient, tasks } = req.body;
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

    const updates = { updated_at: Date.now() };
    if (title !== undefined) updates.title = title;
    if (patientId || patient) updates.patient = nextPatientId;
    if (tasks !== undefined) updates.tasks = tasks;

    const carePlan = await CarePlan.findByIdAndUpdate(carePlanId, updates, { new: true, runValidators: true })
      .populate('tasks')
      .populate('author', 'fullname email');

    notify(notifyRules.carePlanUpdated({
      carePlanId: carePlan._id,
      patientId: carePlan.patient,
      authorId: carePlan.author,
      taskAssigneeIds: getTaskAssigneeIds(carePlan.tasks),
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

exports.getAllCarePlans = async (req, res) => {
  try {
    const { patientId, authorId, page = '1', limit = '20' } = req.query;
    const scoped = await getScopedPatientFilter(req, patientId);
    if (!scoped.ok) return res.status(scoped.status).json({ message: scoped.message });

    const query = { ...scoped.filter };

    if (authorId) query.author = authorId;

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
    const skip = (pageNum - 1) * limitNum;

    const [items, total] = await Promise.all([
      CarePlan.find(query)
        .populate({
          path: 'tasks',
          populate: {
            path: 'assignee',
            select: 'fullname email'
          }
        })
        .populate('patient', 'fullname gender')
        .populate('author', 'fullname email')
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limitNum),
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

exports.getCarePlanByPatient = async (req, res) => {
  try {
    const { patientId } = req.params;
    const scoped = await getScopedPatientFilter(req, patientId);
    if (!scoped.ok) return res.status(scoped.status).json({ message: scoped.message });

    const carePlans = await CarePlan.find(scoped.filter)
      .populate({
        path: 'tasks',
        populate: {
          path: 'assignee',
          select: 'fullname email'
        }
      })
      .populate('author', 'fullname email')
      .sort({ created_at: -1 });

    return res.status(200).json(carePlans);
  } catch (error) {
    return res.status(500).json({ message: 'Error fetching care plan', details: error.message });
  }
};
