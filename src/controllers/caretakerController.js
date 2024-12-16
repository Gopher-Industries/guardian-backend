const Task = require('../models/Task');
const Caretaker = require('../models/Caretaker');
const Patient = require('../models/Patient');

/**
 * Assign a task to a caretaker.
 */
exports.assignTask = async (req, res) => {
  try {
    const { caretakerId, description, priority, dueDate, patientId } = req.body;

    // Validate Caretaker and Patient existence
    const caretaker = await Caretaker.findById(caretakerId);
    const patient = await Patient.findById(patientId);

    if (!caretaker || !patient) {
      return res.status(400).json({ error: 'Invalid caretaker or patient' });
    }

    // Create a new task
    const newTask = new Task({
      caretaker: caretakerId,
      patient: patientId,
      description,
      priority,
      dueDate,
      status: 'pending',
    });

    await newTask.save();
    res.status(201).json({ message: 'Task assigned successfully', task: newTask });
  } catch (error) {
    res.status(500).json({ error: 'Error assigning task', details: error.message });
  }
};

/**
 * Get tasks assigned to a caretaker.
 */
exports.getTasks = async (req, res) => {
  try {
    const tasks = await Task.find({ caretaker: req.user._id }).populate('patient');
    res.status(200).json(tasks);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching tasks', details: error.message });
  }
};

/**
 * Update a task for a caretaker.
 */
exports.updateTask = async (req, res) => {
  try {
    const { taskId } = req.params;
    const updateData = req.body;

    const updatedTask = await Task.findByIdAndUpdate(taskId, updateData, { new: true });

    if (!updatedTask) {
      return res.status(404).json({ error: 'Task not found' });
    }

    res.status(200).json({ message: 'Task updated successfully', task: updatedTask });
  } catch (error) {
    res.status(500).json({ error: 'Error updating task', details: error.message });
  }
};

/**
 * Delete a task for a caretaker.
 */
exports.deleteTask = async (req, res) => {
  try {
    const { taskId } = req.params;

    const deletedTask = await Task.findByIdAndDelete(taskId);

    if (!deletedTask) {
      return res.status(404).json({ error: 'Task not found' });
    }

    res.status(200).json({ message: 'Task deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Error deleting task', details: error.message });
  }
};
