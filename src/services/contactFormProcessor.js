const puppeteer = require('puppeteer');
const logger = require('../config/logger');
const ContactPageFinder = require('./contactPageFinder');
const FormAnalyzer = require('./formAnalyzer');
const FormSubmitter = require('./formSubmitter');
const UrlDetector = require('../utils/urlDetector');
const ResultsManager = require('../utils/resultsManager');

class ContactFormProcessor {
  constructor() {
    this.browser = null;
    this.urlDetector = null;
    this.resultsManager = new ResultsManager();
  }

  /**
   * Initialize browser and URL detector
   */
  async init() {
    try {
      logger.info('Initializing Puppeteer browser...');
      
      this.browser = await puppeteer.launch({
        headless: process.env.HEADLESS === 'true',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
          '--window-size=1920x1080'
        ],
        defaultViewport: {
          width: 1920,
          height: 1080
        }
      });

      logger.info('Browser initialized successfully');

      // Initialize URL detector with browser instance for enhanced detection
      this.urlDetector = new UrlDetector(this.browser);
      logger.info('URL detector initialized with Puppeteer support');

    } catch (error) {
      logger.error('Failed to initialize browser:', { 
        error: error.message,
        stack: error.stack 
      });
      throw error;
    }
  }

  /**
   * Close browser
   */
  async close() {
    if (this.browser) {
      try {
        await this.browser.close();
        logger.info('Browser closed successfully');
      } catch (error) {
        logger.error('Error closing browser:', { error: error.message });
      }
    }
  }

  /**
   * Process a single company
   */
  async processCompany(company) {
    const startTime = Date.now();
    
    logger.info('='.repeat(70));
    logger.info(`Processing: ${company.name} (ID: ${company.id})`);
    logger.info('='.repeat(70));

    try {
      // Step 1: Determine homepage URL
      let homepage = company.homepage;
      
      if (!homepage) {
        logger.info('No homepage provided, attempting to detect...');
        homepage = await this.urlDetector.detectWebsite(company.name);
        
        if (!homepage) {
          throw new Error('Could not detect company website');
        }
      }

      // Normalize URL
      homepage = UrlDetector.normalizeUrl(homepage);
      logger.info(`Homepage: ${homepage}`);

      // Step 2: Determine contact form URL
      let contactFormUrl = company.contact_form_url;
      
      if (contactFormUrl) {
        // Validate provided contact form URL
        logger.info('Contact form URL provided, validating...');
        contactFormUrl = UrlDetector.normalizeUrl(contactFormUrl);
        
        const isValid = await this.urlDetector.validateUrl(contactFormUrl);
        if (!isValid) {
          logger.warn('Provided contact form URL is invalid, searching...');
          contactFormUrl = null;
        }
      }
      
      if (!contactFormUrl) {
        // Find contact page
        logger.info('Searching for contact page...');
        const finder = new ContactPageFinder(this.browser);
        contactFormUrl = await finder.findContactPage(homepage);
        
        if (!contactFormUrl) {
          throw new Error('Could not find contact page');
        }
      }

      logger.info(`Contact form URL: ${contactFormUrl}`);

      // Step 3: Analyze form
      logger.info('Analyzing contact form...');
      const analyzer = new FormAnalyzer(this.browser);
      const formAnalysis = await analyzer.analyzeForm(contactFormUrl);
      
      if (!formAnalysis.contactForm) {
        throw new Error('No suitable contact form found on page');
      }

      logger.info(`Found contact form with ${formAnalysis.contactForm.inputs.length} fields`);

      // Step 4: Fill and submit form
      logger.info('Filling and submitting form...');
      const submitter = new FormSubmitter(this.browser);
      const submissionResult = await submitter.submitForm(
        contactFormUrl, 
        formAnalysis.contactForm
      );

      // Calculate processing time
      const processingTime = Date.now() - startTime;

      // Build result object
      const result = {
        id: company.id,
        name: company.name,
        homepage: homepage,
        contact_form_url: contactFormUrl,
        contact_form_detected: !company.contact_form_url,
        form_analysis: {
          total_forms_found: formAnalysis.totalForms,
          contact_form_score: formAnalysis.contactForm.score,
          input_fields_count: formAnalysis.contactForm.inputs.length,
          input_fields: formAnalysis.contactForm.inputs.map(f => ({
            name: f.name,
            type: f.type,
            fieldType: f.fieldType,
            required: f.required,
            label: f.label
          }))
        },
        submission: submissionResult,
        status: submissionResult.success ? 'SUCCESS' : 'FAILED',
        processing_time_ms: processingTime,
        timestamp: new Date().toISOString()
      };

      // Log result summary
      this.logResultSummary(result);

      // Save result
      await this.resultsManager.saveResult(result);

      return result;

    } catch (error) {
      logger.error(`Failed to process company ${company.name}:`, { 
        error: error.message,
        stack: error.stack 
      });

      const processingTime = Date.now() - startTime;

      const result = {
        id: company.id,
        name: company.name,
        homepage: company.homepage || null,
        contact_form_url: null,
        status: 'ERROR',
        error: error.message,
        processing_time_ms: processingTime,
        timestamp: new Date().toISOString()
      };

      await this.resultsManager.saveResult(result);

      return result;
    }
  }

  /**
   * Log result summary
   */
  logResultSummary(result) {
    logger.info('-'.repeat(70));
    logger.info('RESULT SUMMARY:');
    logger.info(`  Company: ${result.name}`);
    logger.info(`  Status: ${result.status}`);
    logger.info(`  Homepage: ${result.homepage}`);
    logger.info(`  Contact URL: ${result.contact_form_url || 'N/A'}`);
    
    if (result.form_analysis) {
      logger.info(`  Form Fields: ${result.form_analysis.input_fields_count}`);
    }
    
    if (result.submission) {
      logger.info(`  Form Submitted: ${result.submission.success}`);
      logger.info(`  Success Detected: ${result.submission.successDetected || false}`);
      logger.info(`  Has CAPTCHA: ${result.submission.hasCaptcha || false}`);
    }
    
    logger.info(`  Processing Time: ${result.processing_time_ms}ms`);
    logger.info('-'.repeat(70));
  }

  /**
   * Process multiple companies
   */
  async processCompanies(companies) {
    await this.init();

    const results = [];
    const delay = parseInt(process.env.QUEUE_DELAY_BETWEEN_JOBS) || 2000;

    try {
      for (let i = 0; i < companies.length; i++) {
        const company = companies[i];
        
        logger.info(`\nProcessing ${i + 1}/${companies.length}...`);
        
        const result = await this.processCompany(company);
        results.push(result);

        // Delay between requests
        if (i < companies.length - 1) {
          logger.info(`Waiting ${delay}ms before next request...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }

      // Generate final report
      await this.resultsManager.generateReport(results);

      return results;

    } finally {
      await this.close();
    }
  }
}

module.exports = ContactFormProcessor;