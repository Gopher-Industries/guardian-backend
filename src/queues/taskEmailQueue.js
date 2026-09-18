const { Queue } = require('bullmq');

const TASK_EMAIL_QUEUE_NAME = 'guardian-task-email';

function toBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function toPositiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function isTaskEmailQueueEnabled() {
  return toBool(process.env.TASK_EMAIL_QUEUE_ENABLED, false);
}

function getRedisConnection(overrides = {}) {
  const connection = {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: Number(process.env.REDIS_PORT || 6379)
  };

  if (process.env.REDIS_USERNAME) connection.username = process.env.REDIS_USERNAME;
  if (process.env.REDIS_PASSWORD) connection.password = process.env.REDIS_PASSWORD;
  if (toBool(process.env.REDIS_TLS, false)) connection.tls = {};

  return { ...connection, ...overrides };
}

let taskEmailQueue;

function getTaskEmailQueue() {
  if (!taskEmailQueue) {
    taskEmailQueue = new Queue(TASK_EMAIL_QUEUE_NAME, {
      connection: getRedisConnection({
        maxRetriesPerRequest: 1,
        connectTimeout: toPositiveNumber(process.env.REDIS_CONNECT_TIMEOUT_MS, 1500),
        retryStrategy: (attempt) => (attempt > 1 ? null : 200)
      })
    });
  }

  return taskEmailQueue;
}

async function discardTaskEmailQueue() {
  const queue = taskEmailQueue;
  taskEmailQueue = null;
  if (queue) await queue.disconnect().catch(() => {});
}

async function enqueueTaskAssignedEmail(task, options = {}) {
  if (!task?._id) {
    throw new Error('A saved task is required to queue the task email');
  }

  const queue = getTaskEmailQueue();

  try {
    await queue.waitUntilReady();
    return await queue.add(
      'task-assigned',
      {
        taskId: String(task._id),
        assignedById: options.assignedById ? String(options.assignedById) : null
      },
      {
        jobId: `task-assigned-${task._id}`,
        attempts: toPositiveNumber(process.env.EMAIL_QUEUE_ATTEMPTS, 5),
        backoff: {
          type: 'exponential',
          delay: toPositiveNumber(process.env.EMAIL_QUEUE_BACKOFF_MS, 2000)
        },
        removeOnComplete: 100,
        removeOnFail: 100
      }
    );
  } catch (error) {
    await discardTaskEmailQueue();
    throw error;
  }
}

module.exports = {
  TASK_EMAIL_QUEUE_NAME,
  enqueueTaskAssignedEmail,
  getRedisConnection,
  getTaskEmailQueue,
  isTaskEmailQueueEnabled
};
