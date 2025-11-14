const fs = require('fs').promises;
const path = require('path');
const logger = require('../config/logger');

class ResultsManager {
  constructor() {
    this.resultsDir = process.env.RESULTS_OUTPUT_PATH || './results';
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
   * Save individual result
   */
  async saveResult(result) {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `result_${result.id}_${timestamp}.json`;
      const filepath = path.join(this.resultsDir, filename);

      await fs.writeFile(filepath, JSON.stringify(result, null, 2));
      
      logger.debug(`Result saved: ${filename}`);
    } catch (error) {
      logger.error('Failed to save result:', { 
        companyId: result.id,
        error: error.message 
      });
    }
  }

  /**
   * Save batch results
   */
  async saveBatchResults(results, batchName = 'batch') {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `${batchName}_${timestamp}.json`;
      const filepath = path.join(this.resultsDir, filename);

      await fs.writeFile(filepath, JSON.stringify(results, null, 2));
      
      logger.info(`Batch results saved: ${filename}`);
      return filepath;
    } catch (error) {
      logger.error('Failed to save batch results:', { error: error.message });
      throw error;
    }
  }

  /**
   * Generate summary report
   */
  async generateReport(results) {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      
      // Calculate statistics
      const stats = this.calculateStatistics(results);
      
      // Generate report
      const report = {
        generated_at: new Date().toISOString(),
        total_companies: results.length,
        statistics: stats,
        detailed_results: results
      };

      // Save JSON report
      const jsonFilename = `report_${timestamp}.json`;
      const jsonFilepath = path.join(this.resultsDir, jsonFilename);
      await fs.writeFile(jsonFilepath, JSON.stringify(report, null, 2));

      // Save text summary
      const textFilename = `summary_${timestamp}.txt`;
      const textFilepath = path.join(this.resultsDir, textFilename);
      const textReport = this.generateTextReport(report);
      await fs.writeFile(textFilepath, textReport);

      logger.info('=' .repeat(70));
      logger.info('FINAL REPORT GENERATED');
      logger.info('='.repeat(70));
      logger.info(`JSON Report: ${jsonFilepath}`);
      logger.info(`Text Summary: ${textFilepath}`);
      logger.info('='.repeat(70));
      
      // Log statistics
      this.logStatistics(stats);

      return { jsonFilepath, textFilepath, stats };

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

    const withCaptcha = results.filter(r => 
      r.submission && r.submission.hasCaptcha
    ).length;

    const contactFormsDetected = results.filter(r => 
      r.contact_form_detected
    ).length;

    const avgProcessingTime = results.reduce((sum, r) => 
      sum + (r.processing_time_ms || 0), 0
    ) / total;

    const successfulSubmissions = results.filter(r => 
      r.submission && r.submission.success
    ).length;

    const detectedSuccess = results.filter(r => 
      r.submission && r.submission.successDetected
    ).length;

    return {
      total_companies: total,
      successful_processing: successful,
      failed_processing: failed,
      errors: errors,
      success_rate_percentage: ((successful / total) * 100).toFixed(2),
      contact_forms_detected: contactFormsDetected,
      successful_submissions: successfulSubmissions,
      submission_success_rate_percentage: total > 0 
        ? ((successfulSubmissions / total) * 100).toFixed(2)
        : '0.00',
      detected_success_responses: detectedSuccess,
      forms_with_captcha: withCaptcha,
      average_processing_time_ms: Math.round(avgProcessingTime)
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
    text += `Successful Processing: ${stats.successful_processing}\n`;
    text += `Failed Processing: ${stats.failed_processing}\n`;
    text += `Errors: ${stats.errors}\n`;
    text += `Success Rate: ${stats.success_rate_percentage}%\n\n`;

    text += `Contact Forms Detected: ${stats.contact_forms_detected}\n`;
    text += `Successful Submissions: ${stats.successful_submissions}\n`;
    text += `Submission Success Rate: ${stats.submission_success_rate_percentage}%\n`;
    text += `Success Responses Detected: ${stats.detected_success_responses}\n`;
    text += `Forms with CAPTCHA: ${stats.forms_with_captcha}\n\n`;

    text += `Average Processing Time: ${stats.average_processing_time_ms}ms\n\n`;

    text += 'DETAILED RESULTS\n';
    text += '-'.repeat(70) + '\n\n';

    report.detailed_results.forEach((result, index) => {
      text += `${index + 1}. ${result.name} (ID: ${result.id})\n`;
      text += `   Status: ${result.status}\n`;
      text += `   Homepage: ${result.homepage || 'N/A'}\n`;
      text += `   Contact URL: ${result.contact_form_url || 'N/A'}\n`;
      
      if (result.form_analysis) {
        text += `   Form Fields: ${result.form_analysis.input_fields_count}\n`;
      }
      
      if (result.submission) {
        text += `   Submitted: ${result.submission.success}\n`;
        text += `   Success Detected: ${result.submission.successDetected || false}\n`;
        if (result.submission.hasCaptcha) {
          text += `   Note: CAPTCHA detected\n`;
        }
      }
      
      if (result.error) {
        text += `   Error: ${result.error}\n`;
      }
      
      text += `   Processing Time: ${result.processing_time_ms}ms\n\n`;
    });

    return text;
  }

  /**
   * Log statistics to console
   */
  logStatistics(stats) {
    logger.info('STATISTICS:');
    logger.info(`  Total Companies: ${stats.total_companies}`);
    logger.info(`  Successful: ${stats.successful_processing}`);
    logger.info(`  Failed: ${stats.failed_processing}`);
    logger.info(`  Errors: ${stats.errors}`);
    logger.info(`  Success Rate: ${stats.success_rate_percentage}%`);
    logger.info(`  Contact Forms Detected: ${stats.contact_forms_detected}`);
    logger.info(`  Successful Submissions: ${stats.successful_submissions}`);
    logger.info(`  Submission Success Rate: ${stats.submission_success_rate_percentage}%`);
    logger.info(`  Success Responses: ${stats.detected_success_responses}`);
    logger.info(`  Forms with CAPTCHA: ${stats.forms_with_captcha}`);
    logger.info(`  Avg Processing Time: ${stats.average_processing_time_ms}ms`);
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