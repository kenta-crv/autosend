const fs = require('fs').promises;
const path = require('path');
const logger = require('../config/logger');

class ProcessTracker {
  constructor(filePath = './data/processed_companies.json') {
    this.filePath = filePath;
    this.processedCompanies = new Map();
  }

  /**
   * Load processed companies from JSON file
   */
  async load() {
    try {
      const data = await fs.readFile(this.filePath, 'utf8');
      const processed = JSON.parse(data);
      
      processed.forEach(entry => {
        this.processedCompanies.set(entry.id, {
          processedOn: entry.processedOn,
          status: entry.status,
          url: entry.url
        });
      });
      
      logger.info(`Loaded ${this.processedCompanies.size} processed companies`);
    } catch (error) {
      if (error.code === 'ENOENT') {
        logger.info('No processed companies file found, starting fresh');
      } else {
        logger.error('Error loading processed companies:', { error: error.message });
      }
    }
  }

  /**
   * Check if a company has been processed
   */
  checkIfProcessed(companyId) {
    return this.processedCompanies.has(companyId);
  }

  /**
   * Get processed company info
   */
  getProcessedInfo(companyId) {
    return this.processedCompanies.get(companyId);
  }

  /**
   * Save processed company to JSON file
   */
  async saveProcessedCompany(companyId, status, url = null) {
    this.processedCompanies.set(companyId, {
      processedOn: new Date().toISOString(),
      status: status,
      url: url
    });
    await this.save();
  }

  /**
   * Save all processed companies to file
   */
  async save() {
    try {
      const data = Array.from(this.processedCompanies.entries()).map(([id, info]) => ({
        id: id,
        processedOn: info.processedOn,
        status: info.status,
        url: info.url || null
      }));

      // Ensure directory exists
      const dir = path.dirname(this.filePath);
      await fs.mkdir(dir, { recursive: true });

      await fs.writeFile(this.filePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (error) {
      logger.error('Error saving processed companies:', { error: error.message });
    }
  }
}

module.exports = ProcessTracker;