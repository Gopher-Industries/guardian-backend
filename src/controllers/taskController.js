const Task = require('../models/Task');
const Patient = require('../models/Patient');
const User = require('../models/User');

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
    return res.status(201).json({ message: 'Task created', task });
  } catch (error) {
    return res.status(500).json({ message: 'Error creating task', details: error.message });
  }
};

exports.updateTask = async (req, res) => {
  try {
    const { taskId } = req.params;
    const updates = req.body;

    const task = await Task.findByIdAndUpdate(taskId, updates, { new: true, runValidators: true });
    if (!task) return res.status(404).json({ message: 'Task not found' });

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

    return res.status(200).json({ message: 'Task deleted' });
  } catch (error) {
    return res.status(500).json({ message: 'Error deleting task', details: error.message });
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
