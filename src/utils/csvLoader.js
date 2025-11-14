const fs = require('fs');
const csv = require('csv-parser');
const logger = require('../config/logger');

class CsvLoader {
  /**
   * Load companies from CSV file
   * Expected columns: id, name, homepage, contact_form_url
   */
  static async loadFromCsv(filepath) {
    return new Promise((resolve, reject) => {
      const companies = [];
      const errors = [];

      logger.info(`Loading companies from CSV: ${filepath}`);

      fs.createReadStream(filepath)
        .pipe(csv())
        .on('data', (row) => {
          try {
            // Validate required fields
            if (!row.id || !row.name) {
              errors.push({
                row,
                error: 'Missing required fields: id or name'
              });
              return;
            }

            const company = {
              id: row.id.trim(),
              name: row.name.trim(),
              homepage: row.homepage ? row.homepage.trim() : null,
              contact_form_url: row.contact_form_url ? row.contact_form_url.trim() : null
            };

            companies.push(company);
          } catch (error) {
            errors.push({
              row,
              error: error.message
            });
          }
        })
        .on('end', () => {
          logger.info(`CSV loaded: ${companies.length} companies`);
          
          if (errors.length > 0) {
            logger.warn(`CSV loading errors: ${errors.length} rows skipped`, { 
              errors: errors.slice(0, 5) // Log first 5 errors
            });
          }

          resolve({ companies, errors });
        })
        .on('error', (error) => {
          logger.error('Error reading CSV file:', { error: error.message });
          reject(error);
        });
    });
  }

  /**
   * Load companies from JSON file
   */
  static async loadFromJson(filepath) {
    try {
      logger.info(`Loading companies from JSON: ${filepath}`);
      
      const content = await fs.promises.readFile(filepath, 'utf8');
      const data = JSON.parse(content);
      
      let companies = [];
      
      if (Array.isArray(data)) {
        companies = data;
      } else if (data.companies && Array.isArray(data.companies)) {
        companies = data.companies;
      } else {
        throw new Error('Invalid JSON format: expected array or object with companies array');
      }

      logger.info(`JSON loaded: ${companies.length} companies`);
      
      return { companies, errors: [] };

    } catch (error) {
      logger.error('Error reading JSON file:', { error: error.message });
      throw error;
    }
  }

  /**
   * Validate company data
   */
  static validateCompany(company) {
    const errors = [];

    if (!company.id) {
      errors.push('Missing id');
    }

    if (!company.name) {
      errors.push('Missing name');
    }

    if (!company.homepage && !company.contact_form_url) {
      errors.push('Must have either homepage or contact_form_url');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate all companies in a list
   */
  static validateCompanies(companies) {
    const validCompanies = [];
    const invalidCompanies = [];

    companies.forEach((company, index) => {
      const validation = this.validateCompany(company);
      
      if (validation.valid) {
        validCompanies.push(company);
      } else {
        invalidCompanies.push({
          index,
          company,
          errors: validation.errors
        });
      }
    });

    if (invalidCompanies.length > 0) {
      logger.warn(`Found ${invalidCompanies.length} invalid companies`, {
        invalid: invalidCompanies.slice(0, 5)
      });
    }

    return {
      valid: validCompanies,
      invalid: invalidCompanies
    };
  }
}

module.exports = CsvLoader;