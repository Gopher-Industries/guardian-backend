
const Task = require('../models/Task');
const { buildAuditSignature } = require('./signatureService');

// Create a task
async function createTask(data, user) {
  const signature = buildAuditSignature(user);
  const task = new Task({
    ...data,
    createdBy: {
      id: user._id,
      name: user.name,
      role: user.role
    },
    signedBy: signature,
    revisionHistory: [{
      updatedBy: {
        id: user._id,
        name: user.name,
        role: user.role
      },
      updatedAt: signature.signedAt,
      changes: 'Task created'
    }]
  });

  await task.save();
  return task;
}

// Get all tasks assigned to a specific patient
async function getTasksForPatient(patientId) {
  return await Task.find({ patient: patientId, isDeleted: false });
}

// Get all tasks assigned to a specific role and user
async function getTasksForUser(role, userId) {
  return await Task.find({ role, $or: [{ assignedTo: userId }, { 'createdBy.id': userId }], isDeleted: false });
}

// Soft-delete a task if the user is the one who created it
async function deleteTask(taskId, userId) {
  const task = await Task.findById(taskId);
  if (!task) throw new Error('Task not found');
  if (task.createdBy.id.toString() !== userId.toString()) {
    throw new Error('You are not authorized to delete this task');
  }
  task.isDeleted = true;
  task.deletedAt = new Date();
  await task.save();
  return true;
}

module.exports = {
  createTask,
  getTasksForPatient,
  getTasksForUser,
  deleteTask
};
