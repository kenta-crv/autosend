require('dotenv').config();
const queue = require('./config/queue');
const { info, error: _error } = require('./config/logger');
const ContactFormProcessor = require('./services/contactFormProcessor');

// Create processor instance
let processor = null;

/**
 * Initialize processor
 */
async function initProcessor() {
  if (!processor) {
    processor = new ContactFormProcessor();
    await processor.init();
  }
  return processor;
}

/**
 * Process job from queue
 */
async function processJob(job) {
  const { id, name, homepage, contact_form_url } = job.data;
  
  info(`Worker processing job ${job.id}`, { 
    companyId: id, 
    companyName: name 
  });

  try {
    const proc = await initProcessor();
    const result = await proc.processCompany({
      id,
      name,
      homepage,
      contact_form_url
    });

    info(`Job ${job.id} completed successfully`, { 
      companyId: id,
      status: result.status 
    });

    return result;

  } catch (error) {
    _error(`Job ${job.id} failed`, { 
      companyId: id,
      error: error.message,
      stack: error.stack 
    });
    throw error;
  }
}

/**
 * Start worker
 */
async function startWorker() {
  try {
    info('Starting contact form submission worker...');

    // Get concurrency from environment or default to 3
    const concurrency = parseInt(process.env.QUEUE_CONCURRENCY) || 3;
    
    info(`Worker concurrency: ${concurrency}`);

    // Process jobs from queue
    queue.process(concurrency, async (job) => {
      return await processJob(job);
    });

    info('Worker started successfully');
    info('Waiting for jobs...');

  } catch (error) {
    _error('Failed to start worker:', { 
      error: error.message,
      stack: error.stack 
    });
    process.exit(1);
  }
}

/**
 * Graceful shutdown
 */
async function shutdown() {
  info('Shutting down worker...');

  try {
    // Close queue
    await queue.close();
    info('Queue closed');

    // Close processor
    if (processor) {
      await processor.close();
      info('Processor closed');
    }

    info('Worker shutdown complete');
    process.exit(0);

  } catch (error) {
    _error('Error during shutdown:', { error: error.message });
    process.exit(1);
  }
}

// Handle shutdown signals
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  _error('Uncaught exception:', { 
    error: error.message,
    stack: error.stack 
  });
  shutdown();
});

process.on('unhandledRejection', (reason, promise) => {
  _error('Unhandled rejection:', { 
    reason,
    promise 
  });
});

// Start worker
startWorker();