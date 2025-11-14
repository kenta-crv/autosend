const Queue = require('bull');
const { error: _error, debug, info, warn } = require('./logger');

const contactFormQueue = new Queue('contact-form-submissions', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || undefined
  },
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000
    },
    removeOnComplete: true,
    removeOnFail: false
  }
});

// Queue event listeners
contactFormQueue.on('error', (error) => {
  _error('Queue error:', { error: error.message, stack: error.stack });
});

contactFormQueue.on('waiting', (jobId) => {
  debug(`Job ${jobId} is waiting`);
});

contactFormQueue.on('active', (job) => {
  info(`Job ${job.id} started processing`, { 
    companyId: job.data.id,
    companyName: job.data.name 
  });
});

contactFormQueue.on('completed', (job, result) => {
  info(`Job ${job.id} completed`, { 
    companyId: job.data.id,
    companyName: job.data.name,
    success: result.form_submitted 
  });
});

contactFormQueue.on('failed', (job, err) => {
  _error(`Job ${job.id} failed`, { 
    companyId: job.data.id,
    companyName: job.data.name,
    error: err.message,
    attemptsMade: job.attemptsMade
  });
});

contactFormQueue.on('stalled', (job) => {
  warn(`Job ${job.id} stalled`, { 
    companyId: job.data.id,
    companyName: job.data.name 
  });
});

module.exports = contactFormQueue;