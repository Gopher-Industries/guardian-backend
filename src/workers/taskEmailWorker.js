require('dotenv').config();

const mongoose = require('mongoose');
const { Worker } = require('bullmq');
const Task = require('../models/Task');
const { sendTaskAssignedEmail } = require('../services/taskEmailService');
const {
  TASK_EMAIL_QUEUE_NAME,
  getRedisConnection
} = require('../queues/taskEmailQueue');

mongoose.set('strictQuery', false);

async function startWorker() {
  await mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  });

  const concurrency = Number(process.env.EMAIL_WORKER_CONCURRENCY || 3);
  console.log(JSON.stringify({
    event: 'task_email_worker_started',
    queue: TASK_EMAIL_QUEUE_NAME,
    concurrency
  }));

  const worker = new Worker(
    TASK_EMAIL_QUEUE_NAME,
    async (job) => {
      console.log(JSON.stringify({
        event: 'task_assignment_email_processing',
        jobId: job.id,
        taskId: job.data.taskId,
        attempt: job.attemptsMade + 1
      }));

      const task = await Task.findById(job.data.taskId);
      if (!task) {
        throw new Error(`Task ${job.data.taskId} was not found`);
      }

      return sendTaskAssignedEmail(task, {
        assignedById: job.data.assignedById
      });
    },
    {
      connection: getRedisConnection({
        maxRetriesPerRequest: null,
        retryStrategy: (attempt) => Math.min(attempt * 500, 5000)
      }),
      concurrency
    }
  );

  worker.on('completed', (job) => {
    console.log(JSON.stringify({
      event: 'task_assignment_email_completed',
      jobId: job.id,
      taskId: job.data.taskId,
      attemptsMade: job.attemptsMade
    }));
  });

  worker.on('failed', (job, error) => {
    console.error(JSON.stringify({
      event: 'task_assignment_email_attempt_failed',
      jobId: job?.id || null,
      taskId: job?.data?.taskId || null,
      attemptsMade: job?.attemptsMade || 0,
      error: error.message
    }));
  });

  let lastWorkerError = null;
  let lastWorkerErrorLoggedAt = 0;

  worker.on('error', (error) => {
    const now = Date.now();
    const shouldLog = error.message !== lastWorkerError || now - lastWorkerErrorLoggedAt >= 30000;

    if (shouldLog) {
      console.error(JSON.stringify({
        event: 'task_email_worker_error',
        error: error.message
      }));
      lastWorkerErrorLoggedAt = now;
    }

    lastWorkerError = error.message;
  });

  worker.on('ready', () => {
    if (!lastWorkerError) return;
    console.log(JSON.stringify({
      event: 'task_email_worker_redis_reconnected'
    }));
    lastWorkerError = null;
    lastWorkerErrorLoggedAt = 0;
  });

  let stopping = false;
  async function shutdown(signal) {
    if (stopping) return;
    stopping = true;
    console.log(JSON.stringify({ event: 'task_email_worker_stopping', signal }));
    await worker.close();
    await mongoose.disconnect();
    process.exit(0);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

startWorker().catch((error) => {
  console.error(JSON.stringify({
    event: 'task_email_worker_start_failed',
    error: error.message
  }));
  process.exit(1);
});
