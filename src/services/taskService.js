const Task = require('../models/Task');

async function createTask(taskData) {
  const task = new Task(taskData);
  await task.save();
  return task;
}

// Get all tasks assigned to a specific patient
async function getPatientTasks(patientId) {
  return await Task.find({ patient: patientId });
}

// Get all tasks assigned to a specific role and user
async function getUserTasks(role, userId) {
  const query = {};
  query[role] = userId;
  return await Task.find(query);
}

// Delete a task if the user is the one who created it
async function deleteTask(taskId, userId) {
  const task = await Task.findById(taskId);
  if (!task) throw new Error('Task not found');
  if (task.createdBy.toString() !== userId.toString()) {
    throw new Error('You are not authorized to delete this task');
  }
  await task.deleteOne();
  return true;
}

module.exports = {
  createTask,
  getPatientTasks,
  getUserTasks,
  deleteTask
};