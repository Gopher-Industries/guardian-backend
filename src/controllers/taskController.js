const Task = require('../models/Task');
const Patient = require('../models/Patient');
const User = require('../models/User');
const notifyRules = require('../services/notifyRules');

function notify(promise) {
  Promise.resolve(promise).catch(() => {});
}

exports.createTask = async (req, res) => {
  try {
    const { title, description, dueDate, priority, status, patientId, assigneeId } = req.body;
    
    if (!title || !description || !dueDate || !patientId || !assigneeId) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const patient = await Patient.findById(patientId);
    if (!patient) return res.status(404).json({ message: 'Patient not found' });

    const assignee = await User.findById(assigneeId);
    if (!assignee) return res.status(404).json({ message: 'Assignee not found' });

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
    const updates = { ...req.body, updated_at: Date.now() };

    if (updates.patientId) {
      const patient = await Patient.findById(updates.patientId);
      if (!patient) return res.status(404).json({ message: 'Patient not found' });
      updates.patient = updates.patientId;
      delete updates.patientId;
    }

    if (updates.assigneeId) {
      const assignee = await User.findById(updates.assigneeId);
      if (!assignee) return res.status(404).json({ message: 'Assignee not found' });
      updates.assignee = updates.assigneeId;
      delete updates.assigneeId;
    }

    const task = await Task.findByIdAndUpdate(taskId, updates, { new: true, runValidators: true });
    if (!task) return res.status(404).json({ message: 'Task not found' });

    notify(notifyRules.assigneeTaskUpdated({
      taskId: task._id,
      patientId: task.patient,
      assigneeId: task.assignee,
      status: task.status,
      dueDate: task.dueDate,
      actorId: req.user?._id
    }));

    return res.status(200).json({ message: 'Task updated', task });
  } catch (error) {
    return res.status(500).json({ message: 'Error updating task', details: error.message });
  }
};

exports.deleteTask = async (req, res) => {
  try {
    const { taskId } = req.params;
    const task = await Task.findByIdAndDelete(taskId);
    if (!task) return res.status(404).json({ message: 'Task not found' });

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
    const query = {};

    if (status) query.status = status;
    if (priority) query.priority = priority;
    if (patientId) query.patient = patientId;
    if (assigneeId) query.assignee = assigneeId;

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
    const tasks = await Task.find({ patient: patientId })
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
    const tasks = await Task.find({ assignee: assigneeId })
      .populate('patient', 'fullname gender')
      .sort({ dueDate: 1 });
    return res.status(200).json(tasks);
  } catch (error) {
    return res.status(500).json({ message: 'Error fetching assignee tasks', details: error.message });
  }
};
