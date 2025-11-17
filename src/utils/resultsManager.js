const fs = require('fs').promises;
const path = require('path');
const logger = require('../config/logger');

class ResultsManager {
  constructor() {
    this.resultsDir = process.env.RESULTS_OUTPUT_PATH || './results';
    this.results = []; // Store all results in memory
    this.currentBatchFile = null;
    this.ensureResultsDirectory();
  }

  /**
   * Ensure results directory exists
   */
  async ensureResultsDirectory() {
    try {
      await fs.mkdir(this.resultsDir, { recursive: true });
    } catch (error) {
      logger.error('Failed to create results directory:', { error: error.message });
    }
  }

  /**
   * Save individual result (simplified format)
   */
  async saveResult(result) {
    try {
      // Simplify the result to only required fields
      const simplifiedResult = {
        id: result.id,
        name: result.name,
        homepage: result.homepage || null,
        contact_form_url: result.contact_form_url || null,
        contact_form_detected: result.contact_form_detected || false,
        bot_detected: result.submission?.hasCaptcha || false,
        status: result.status,
        message: this.generateMessage(result)
      };

      // Add to in-memory collection
      this.results.push(simplifiedResult);

      // Initialize batch file if not exists
      if (!this.currentBatchFile) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        this.currentBatchFile = path.join(this.resultsDir, `batch_${timestamp}.json`);
      }

      // Save entire batch to single file
      await fs.writeFile(
        this.currentBatchFile, 
        JSON.stringify(this.results, null, 2)
      );
      
      logger.debug(`Result saved to batch file: ${this.currentBatchFile}`);
    } catch (error) {
      logger.error('Failed to save result:', { 
        companyId: result.id,
        error: error.message 
      });
    }
  }

  /**
   * Generate message based on result
   */
  generateMessage(result) {
    logger.info('Generating message for result:', { result });
    if (result.status === 'SUCCESS') {
      if (result.submission?.successDetected) {
        return 'Form submitted successfully and success message detected';
      } else {
        return 'Form submitted successfully';
      }
    } else if (result.status === 'FAILED') {
      if (result.submission?.hasCaptcha) {
        return 'Form submission failed - CAPTCHA detected';
      } else if (result.submission?.error) {
        return `Form submission failed - ${result.submission.error}`;
      } else {
        return 'Form submission failed';
      }
    } else if (result.status === 'ERROR') {
      return result.error || 'Processing error occurred';
    }
    
    return result.message || 'No additional information';
  }

  /**
   * Get current batch file path
   */
  getCurrentBatchFile() {
    return this.currentBatchFile;
  }

  /**
   * Get all results in memory
   */
  getResults() {
    return this.results;
  }

  /**
   * Clear results (for new batch)
   */
  clearResults() {
    this.results = [];
    this.currentBatchFile = null;
  }

  /**
   * Generate summary report
   */
  async generateReport(results = null) {
    try {
      const resultsToReport = results || this.results;
      
      if (resultsToReport.length === 0) {
        logger.warn('No results to generate report');
        return null;
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      
      // Calculate statistics
      const stats = this.calculateStatistics(resultsToReport);
      
      // Generate report
      const report = {
        generated_at: new Date().toISOString(),
        total_companies: resultsToReport.length,
        statistics: stats,
        results: resultsToReport
      };

      // Save JSON report (same as batch file if using in-memory results)
      const jsonFilename = `report_${timestamp}.json`;
      const jsonFilepath = path.join(this.resultsDir, jsonFilename);
      //await fs.writeFile(jsonFilepath, JSON.stringify(report, null, 2));

      // Save text summary
      // const textFilename = `summary_${timestamp}.txt`;
      // const textFilepath = path.join(this.resultsDir, textFilename);
      // const textReport = this.generateTextReport(report);
      // await fs.writeFile(textFilepath, textReport);

      logger.info('=' .repeat(70));
      logger.info('FINAL REPORT GENERATED');
      logger.info('='.repeat(70));
     // logger.info(`JSON Report: ${jsonFilepath}`);
      
      logger.info('='.repeat(70));
      
      // Log statistics
      this.logStatistics(stats);

      return { jsonFilepath, stats };

    } catch (error) {
      logger.error('Failed to generate report:', { error: error.message });
      throw error;
    }
  }

  /**
   * Calculate statistics from results
   */
  calculateStatistics(results) {
    const total = results.length;
    const successful = results.filter(r => r.status === 'SUCCESS').length;
    const failed = results.filter(r => r.status === 'FAILED').length;
    const errors = results.filter(r => r.status === 'ERROR').length;

    const withCaptcha = results.filter(r => r.bot_detected).length;

    const contactFormsDetected = results.filter(r => 
      r.contact_form_detected
    ).length;

    const websiteDetected = results.filter(r => 
      r.homepage && r.homepage !== null
    ).length;

    return {
      total_companies: total,
      successful_submissions: successful,
      failed_submissions: failed,
      errors: errors,
      success_rate_percentage: total > 0 ? ((successful / total) * 100).toFixed(2) : '0.00',
      contact_forms_detected: contactFormsDetected,
      websites_found: websiteDetected,
      bot_captcha_detected: withCaptcha
    };
  }

  /**
   * Generate text report
   */
  generateTextReport(report) {
    const stats = report.statistics;
    let text = '';

    text += '='.repeat(70) + '\n';
    text += 'CONTACT FORM SUBMISSION REPORT\n';
    text += '='.repeat(70) + '\n\n';

    text += `Generated: ${report.generated_at}\n\n`;

    text += 'STATISTICS\n';
    text += '-'.repeat(70) + '\n';
    text += `Total Companies Processed: ${stats.total_companies}\n`;
    text += `Successful Submissions: ${stats.successful_submissions}\n`;
    text += `Failed Submissions: ${stats.failed_submissions}\n`;
    text += `Errors: ${stats.errors}\n`;
    text += `Success Rate: ${stats.success_rate_percentage}%\n\n`;

    text += `Contact Forms Detected: ${stats.contact_forms_detected}\n`;
    text += `Websites Found: ${stats.websites_found}\n`;
    text += `Bot/CAPTCHA Detected: ${stats.bot_captcha_detected}\n\n`;

    text += 'DETAILED RESULTS\n';
    text += '-'.repeat(70) + '\n\n';

    report.results.forEach((result, index) => {
      text += `${index + 1}. ${result.name} (ID: ${result.id})\n`;
      text += `   Status: ${result.status}\n`;
      text += `   Homepage: ${result.homepage || 'N/A'}\n`;
      text += `   Contact URL: ${result.contact_form_url || 'N/A'}\n`;
      text += `   Contact Form Detected: ${result.contact_form_detected ? 'Yes' : 'No'}\n`;
      text += `   Bot Detected: ${result.bot_detected ? 'Yes' : 'No'}\n`;
      text += `   Message: ${result.message}\n\n`;
    });

    return text;
  }

  /**
   * Log statistics to console
   */
  logStatistics(stats) {
    logger.info('STATISTICS:');
    logger.info(`  Total Companies: ${stats.total_companies}`);
    logger.info(`  Successful: ${stats.successful_submissions}`);
    logger.info(`  Failed: ${stats.failed_submissions}`);
    logger.info(`  Errors: ${stats.errors}`);
    logger.info(`  Success Rate: ${stats.success_rate_percentage}%`);
    logger.info(`  Contact Forms Detected: ${stats.contact_forms_detected}`);
    logger.info(`  Websites Found: ${stats.websites_found}`);
    logger.info(`  Bot/CAPTCHA Detected: ${stats.bot_captcha_detected}`);
  }

  /**
   * Load results from file
   */
  async loadResults(filename) {
    try {
      const filepath = path.join(this.resultsDir, filename);
      const content = await fs.readFile(filepath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      logger.error('Failed to load results:', { 
        filename,
        error: error.message 
      });
      throw error;
    }
  }
}

module.exports = ResultsManager;