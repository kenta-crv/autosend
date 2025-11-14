const axios = require('axios');
const cheerio = require('cheerio');
const logger = require('../config/logger');

class UrlDetector {
  /**
   * Detect company website from company name using search
   */
  static async detectWebsite(companyName) {
    try {
      logger.info(`Detecting website for: ${companyName}`);
      
      // This is a placeholder - in production, you might want to:
      // 1. Use a search API (Google Custom Search, Bing, etc.)
      // 2. Use a business directory API
      // 3. Use web scraping with proper rate limiting
      
      // For now, we'll try common patterns
      const possibleDomains = [
        `https://www.${companyName.toLowerCase().replace(/\s+/g, '')}.com`,
        `https://${companyName.toLowerCase().replace(/\s+/g, '')}.com`,
        `https://www.${companyName.toLowerCase().replace(/\s+/g, '-')}.com`,
        `https://${companyName.toLowerCase().replace(/\s+/g, '-')}.com`
      ];

      for (const domain of possibleDomains) {
        try {
          const response = await axios.head(domain, { 
            timeout: 5000,
            maxRedirects: 5,
            validateStatus: (status) => status < 500
          });
          
          if (response.status === 200) {
            logger.info(`Website detected: ${domain}`, { companyName });
            return domain;
          }
        } catch (error) {
          // Continue to next domain
          continue;
        }
      }

      logger.warn(`Could not detect website for: ${companyName}`);
      return null;

    } catch (error) {
      logger.error(`Error detecting website for ${companyName}:`, { 
        error: error.message 
      });
      return null;
    }
  }

  /**
   * Validate if a URL is accessible
   */
  static async validateUrl(url) {
    try {
      const response = await axios.head(url, {
        timeout: 10000,
        maxRedirects: 5,
        validateStatus: (status) => status < 500
      });
      
      return response.status === 200;
    } catch (error) {
      logger.debug(`URL validation failed for ${url}:`, { error: error.message });
      return false;
    }
  }

  /**
   * Extract domain from URL
   */
  static extractDomain(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.origin;
    } catch (error) {
      logger.error(`Invalid URL format: ${url}`);
      return null;
    }
  }

  /**
   * Normalize URL (ensure proper format)
   */
  static normalizeUrl(url) {
    if (!url) return null;
    
    // Add protocol if missing
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }
    
    try {
      const urlObj = new URL(url);
      return urlObj.href;
    } catch (error) {
      logger.error(`Cannot normalize URL: ${url}`, { error: error.message });
      return null;
    }
  }
}

module.exports = UrlDetector;