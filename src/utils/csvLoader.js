const fs = require('fs');
const csv = require('csv-parser');
const logger = require('../config/logger');
const Blacklist = require('../config/blacklist');

class CsvLoader {
  /**
   * Validate if a URL is valid
   */
  static isValidUrl(urlString) {
    if (!urlString || urlString.trim() === '') {
      return false;
    }
    
    // Remove common prefixes that might be in the data
    const cleanUrl = urlString.trim().replace(/^__+|__+$/g, '');
    
    try {
      const url = new URL(cleanUrl);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch (e) {
      return false;
    }
  }

  /**
   * Clean and validate URL
   */
  static cleanUrl(urlString) {
    if (!urlString) return null;
    
    // Remove double underscores from start and end
    const cleaned = urlString.trim().replace(/^__+|__+$/g, '');
    
    return this.isValidUrl(cleaned) ? cleaned : null;
  }

  /**
   * Load companies from CSV file
   * Expected columns: id, company, tel, address, url, url_2, title, industry, genre, contact_url
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
            if (!row.id || !row.company) {
              errors.push({
                row,
                error: 'Missing required fields: id or company'
              });
              return;
            }

            // Clean and validate URLs
            const url2 = this.cleanUrl(row.url_2);
            const contactUrl = this.cleanUrl(row.contact_url);
            const url = this.cleanUrl(row.url);

            // Determine which URL to use for scraping
            // Priority: url_2 (if valid) -> contact_url
            let homepage = null;
            let contact_form_url = null;

            if (url2) {
              // Check if url_2 is blacklisted
              const blacklistCheck = Blacklist.isBlacklisted(url2);
              if (blacklistCheck.isBlacklisted) {
                logger.warn(`Company "${row.company}" (ID: ${row.id}) - url_2 blacklisted: ${blacklistCheck.reason}`);
                errors.push({
                  row,
                  error: `url_2 blacklisted: ${blacklistCheck.reason}`
                });
                return; // Skip this company
              }
              homepage = url2;
            } else if (contactUrl) {
              // Check if contact_url is blacklisted
              const blacklistCheck = Blacklist.isBlacklisted(contactUrl);
              if (blacklistCheck.isBlacklisted) {
                logger.warn(`Company "${row.company}" (ID: ${row.id}) - contact_url blacklisted: ${blacklistCheck.reason}`);
                errors.push({
                  row,
                  error: `contact_url blacklisted: ${blacklistCheck.reason}`
                });
                return; // Skip this company
              }
              homepage = contactUrl;
            }

            // Store contact_url separately if available
            if (contactUrl) {
              contact_form_url = contactUrl;
            }

            const company = {
              id: row.id.trim(),
              name: row.company.trim(),
              tel: row.tel ? row.tel.trim() : null,
              address: row.address ? row.address.trim() : null,
              url: url,
              url_2: url2,
              title: row.title ? row.title.trim() : null,
              industry: row.industry ? row.industry.trim() : null,
              genre: row.genre ? row.genre.trim() : null,
              contact_url: contactUrl,
              homepage: homepage,
              contact_form_url: contact_form_url
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