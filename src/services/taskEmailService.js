const Patient = require('../models/Patient');
const User = require('../models/User');
const { getEmailConfig } = require('../config/emailConfig');
const emailService = require('./emailService');
const { formatDateTime } = require('../utils/datetime');
const {
  enqueueTaskAssignedEmail,
  isTaskEmailQueueEnabled
} = require('../queues/taskEmailQueue');

async function sendTaskAssignedEmail(task, options = {}) {
  if (!task || !task.assignee) {
    throw new Error('A saved task with an assignee is required to send the task email');
  }

  const assignedById = task.setBy || options.assignedById;
  const [assignee, assignedBy, patient] = await Promise.all([
    User.findById(task.assignee).select('fullname email').lean(),
    assignedById
      ? User.findById(assignedById).select('fullname').lean()
      : Promise.resolve(null),
    task.patient
      ? Patient.findById(task.patient).select('fullname uuid').lean()
      : Promise.resolve(null)
  ]);

  if (!assignee) {
    throw new Error('Task assignee was not found');
  }

  if (!assignee.email) {
    throw new Error('Task assignee does not have an email address');
  }

  const title = task.title || task.description;
  const config = getEmailConfig();

  return emailService.sendTemplatedEmail('task-assigned', {
    to: assignee.email,
    name: assignee.fullname,
    taskTitle: title,
    patientName: patient?.fullname,
    patientId: patient?.uuid,
    dueDate: formatDateTime(task.dueDate, {
      timeZone: config.timezone,
      locale: config.locale
    }),
    priority: task.priority,
    assignedBy: assignedBy?.fullname,
    notes: task.description && task.description !== title
      ? task.description
      : undefined,
    taskUrl: `${config.appUrl.replace(/\/$/, '')}/tasks/${task._id}`
  });
}

function startDirectTaskAssignedEmail(task, options = {}, reason = 'queue_disabled') {
  console.log(JSON.stringify({
    event: 'task_assignment_email_direct_started',
    taskId: task?._id ? String(task._id) : null,
    assigneeId: task?.assignee ? String(task.assignee) : null,
    reason
  }));

  return Promise.resolve()
    .then(() => sendTaskAssignedEmail(task, options))
    .then((result) => {
      console.log(JSON.stringify({
        event: 'task_assignment_email_direct_completed',
        taskId: task?._id ? String(task._id) : null,
        assigneeId: task?.assignee ? String(task.assignee) : null,
        reason
      }));
      return result;
    })
    .catch((error) => {
      console.error(JSON.stringify({
        event: 'task_assignment_email_direct_failed',
        taskId: task?._id ? String(task._id) : null,
        assigneeId: task?.assignee ? String(task.assignee) : null,
        outboxId: error.outboxId || null,
        reason,
        error: error.message
      }));
      return null;
    });
}

async function queueTaskAssignedEmail(task, options = {}) {
  if (!isTaskEmailQueueEnabled()) {
    startDirectTaskAssignedEmail(task, options);
    return { mode: 'direct' };
  }

  try {
    const job = await enqueueTaskAssignedEmail(task, options);
    console.log(JSON.stringify({
      event: 'task_assignment_email_queued',
      jobId: job?.id ? String(job.id) : null,
      taskId: task?._id ? String(task._id) : null,
      assigneeId: task?.assignee ? String(task.assignee) : null
    }));
    return { mode: 'queued', jobId: job?.id || null };
  } catch (error) {
    console.error(JSON.stringify({
      event: 'task_assignment_email_queue_failed',
      taskId: task?._id ? String(task._id) : null,
      assigneeId: task?.assignee ? String(task.assignee) : null,
      error: error.message
    }));

    startDirectTaskAssignedEmail(task, options, 'queue_unavailable');
    return { mode: 'direct_fallback' };
  }
}

module.exports = { sendTaskAssignedEmail, queueTaskAssignedEmail };
