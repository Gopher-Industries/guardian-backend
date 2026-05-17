const CarePlan = require('../models/CarePlan');
const Patient = require('../models/Patient');
const Task = require('../models/Task');
const notifyRules = require('../services/notifyRules');

function notify(promise) {
  Promise.resolve(promise).catch(() => {});
}

function getTaskAssigneeIds(tasks = []) {
  return tasks.map(task => task.assignee).filter(Boolean);
}

exports.createCarePlan = async (req, res) => {
  try {
    const { title, patientId, tasks } = req.body;
    const authorId = req.user._id;

    if (!title || !patientId) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const patient = await Patient.findById(patientId);
    if (!patient) return res.status(404).json({ message: 'Patient not found' });

    const carePlan = new CarePlan({
      title,
      patient: patientId,
      author: authorId,
      tasks: tasks || []
    });

    await carePlan.save();

    const carePlanTasks = tasks?.length
      ? await Task.find({ _id: { $in: tasks } }).select('assignee').lean()
      : [];

    notify(notifyRules.carePlanCreated({
      carePlanId: carePlan._id,
      patientId,
      authorId,
      taskAssigneeIds: getTaskAssigneeIds(carePlanTasks),
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
    const updates = { ...req.body, updated_at: Date.now() };

    const carePlan = await CarePlan.findByIdAndUpdate(carePlanId, updates, { new: true, runValidators: true })
      .populate('tasks')
      .populate('author', 'fullname email');

    if (!carePlan) return res.status(404).json({ message: 'Care plan not found' });

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
    const carePlan = await CarePlan.findByIdAndDelete(carePlanId).populate('tasks');

    if (!carePlan) return res.status(404).json({ message: 'Care plan not found' });

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
    const query = {};

    if (patientId) query.patient = patientId;
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
    const carePlans = await CarePlan.find({ patient: patientId })
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
