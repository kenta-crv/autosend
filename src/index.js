require('dotenv').config();
const contactFormQueue = require('./config/queue');
const logger = require('./config/logger');
const CsvLoader = require('./utils/csvLoader');
const ContactFormProcessor = require('./services/contactFormProcessor');

/**
 * Add companies to queue for processing
 */
async function addToQueue(companies) {
  logger.info(`Adding ${companies.length} companies to queue...`);

  const jobPromises = companies.map(company => {
    return contactFormQueue.add(company, {
      jobId: `company-${company.id}`,
      removeOnComplete: true,
      removeOnFail: false
    });
  });

  await Promise.all(jobPromises);
  
  logger.info(`Successfully added ${companies.length} jobs to queue`);
}

/**
 * Process companies directly (without queue)
 */
async function processDirect(companies) {
  logger.info(`Processing ${companies.length} companies directly...`);

  const processor = new ContactFormProcessor();
  const results = await processor.processCompanies(companies);

  logger.info('Direct processing completed');
  return results;
}

/**
 * Main function
 */
async function main() {
  try {
    logger.info('='.repeat(70));
    logger.info('CONTACT FORM AUTOMATION SYSTEM');
    logger.info('='.repeat(70));

    // Get command line arguments
    const args = process.argv.slice(2);
    const command = args[0];

    if (!command) {
      console.log(`
Usage:
  node src/index.js <command> [options]

Commands:
  direct <file>     - Process companies directly from file (CSV or JSON)
  queue <file>      - Add companies to queue from file (CSV or JSON)
  test              - Run with test data
  help              - Show this help message

Examples:
  node src/index.js direct companies.csv
  node src/index.js queue companies.json
  node src/index.js test
      `);
      return;
    }

    let companies = [];

    switch (command) {
      case 'test': {
        logger.info('Running with test data...');
        companies = [
          {
            id: 1,
            name: 'yyengine',
            homepage: 'https://yyengine.jp/contact/',
            contact_url: "https://www.yumemi.co.jp/contacts"
          },
          // {
          //   id: 2,
          //   name: 'BlogTyrant',
          //   homepage: 'https://www.blogtyrant.com/',
          //   contact_form_url: null
          // },
          // {
          //   id: 3,
          //   name: 'Tech Insider Talk',
          //   homepage: 'https://techinsidertalk.com/',
          //   contact_form_url: null
          // }
        ];
        
        await processDirect(companies);
        break;
      }

      case 'direct': {
        const filepath = args[1];
        
        if (!filepath) {
          logger.error('Please provide a file path');
          process.exit(1);
        }

        // Load companies from file
        let loadResult;
        if (filepath.endsWith('.csv')) {
          loadResult = await CsvLoader.loadFromCsv(filepath);
        }  else {
          logger.error('Unsupported file format. Use .csv');
          process.exit(1);
        }

        // Validate companies
        const validation = CsvLoader.validateCompanies(loadResult.companies);
        companies = validation.valid;

        if (companies.length === 0) {
          logger.error('No valid companies found in file');
          process.exit(1);
        }

        logger.info(`Loaded ${companies.length} valid companies`);

        // Process directly
        await processDirect(companies);
        break;
      }

      case 'queue': {
        const filepath = args[1];
        
        if (!filepath) {
          logger.error('Please provide a file path');
          process.exit(1);
        }

        // Load companies from file
        let loadResult;
        if (filepath.endsWith('.csv')) {
          loadResult = await CsvLoader.loadFromCsv(filepath);
        } else if (filepath.endsWith('.json')) {
          loadResult = await CsvLoader.loadFromJson(filepath);
        } else {
          logger.error('Unsupported file format. Use .csv or .json');
          process.exit(1);
        }

        // Validate companies
        const validation = CsvLoader.validateCompanies(loadResult.companies);
        companies = validation.valid;

        if (companies.length === 0) {
          logger.error('No valid companies found in file');
          process.exit(1);
        }

        logger.info(`Loaded ${companies.length} valid companies`);

        // Add to queue
        await addToQueue(companies);
        
        logger.info('Companies added to queue. Start worker with: npm run worker');
        break;
      }

      case 'help':
      default: {
        console.log(`
Usage:
  node src/index.js <command> [options]

Commands:
  direct <file>     - Process companies directly from file (CSV or JSON)
  queue <file>      - Add companies to queue from file (CSV or JSON)
  test              - Run with test data
  help              - Show this help message

Examples:
  node src/index.js direct companies.csv
  node src/index.js queue companies.json
  node src/index.js test

For queue processing:
  1. Add companies to queue: node src/index.js queue companies.csv
  2. Start worker: npm run worker
        `);
        break;
      }
    }

    logger.info('='.repeat(70));
    logger.info('PROCESS COMPLETED');
    logger.info('='.repeat(70));

  } catch (error) {
    logger.error('Fatal error:', { 
      error: error.message,
      stack: error.stack 
    });
    process.exit(1);
  }
}

// Run main function
main();