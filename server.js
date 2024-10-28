import express from 'express';
import cluster from 'cluster';
import os from 'os';
import winston from 'winston';
import pLimit from 'p-limit'; 
const logger = winston.createLogger({
  transports: [
    new winston.transports.File({ filename: 'task_logs.log' })
  ]
});

// Rate limits
const RATE_LIMIT_SECOND = 1; 
const RATE_LIMIT_MINUTE = 20;

// In-memory storage for task queue and rate limits
const userTaskQueue = new Map();

// Task function to log completion
async function task(user_id) {
  const timestamp = new Date().toISOString();
  console.log(`${user_id}-task completed at-${timestamp}`);
  logger.info(`${user_id}-task completed at-${timestamp}`);
}

// Worker logic
if (cluster.isPrimary) {
  const numCPUs = Math.min(2, os.cpus().length); // Using 2 replicas as specified
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }
  cluster.on('exit', (worker) => {
    console.log(`Worker ${worker.process.pid} died. Restarting...`);
    cluster.fork();
  });
} else {
  // API server setup
  const app = express();
  app.use(express.json());

  // Middleware to process task queue per user
  app.post('/api/v1/process-task', async (req, res) => {
    const { user_id } = req.body;
    if (!user_id) {
      return res.status(400).json({ error: 'user_id is required' });
    }

    // Initialize task queue and rate limits for the user if not already done
    if (!userTaskQueue.has(user_id)) {
      userTaskQueue.set(user_id, {
        tasks: [],
        lastExecutionTime: 0,
        minuteCount: 0,
        limit: pLimit(1), // Ensures 1 task per second per user
      });
    }

    const userQueue = userTaskQueue.get(user_id);
    
    // Rate limit check: 20 tasks per minute
    const now = Date.now();
    const timeSinceLastExecution = now - userQueue.lastExecutionTime;
    const currentMinute = Math.floor(now / 60000);
    const lastExecutionMinute = Math.floor(userQueue.lastExecutionTime / 60000);
    
    // Reset minute count if it's a new minute
    if (currentMinute !== lastExecutionMinute) {
      userQueue.minuteCount = 0; // Reset minute count for new minute
    }

    // Rate limiting checks
    if (timeSinceLastExecution < 1000 || userQueue.minuteCount >= RATE_LIMIT_MINUTE) {
      return res.status(429).json({ error: 'Rate limit exceeded, task queued' });
    }

    // Queue the task with a 1-second rate limiter
    userQueue.tasks.push(() => userQueue.limit(() => taskProcessor(user_id)));
    userQueue.lastExecutionTime = now;
    userQueue.minuteCount++;

    res.status(200).json({ message: 'Task queued successfully' });

    processQueue(user_id);
  });

  async function taskProcessor(user_id) {
    await task(user_id);

  }

  // Queue processor
  function processQueue(user_id) {
    const userQueue = userTaskQueue.get(user_id);
    if (!userQueue || !userQueue.tasks.length) return;

    // Execute the next task in the queue if rate limits allow
    const nextTask = userQueue.tasks.shift();
    if (nextTask) {
      nextTask();
    }
  }

  app.listen(3000, () => {
    console.log(`Worker ${process.pid} started on port 3000`);
  });
}
