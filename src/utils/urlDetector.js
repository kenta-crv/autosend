const WebsiteDetector = require('../services/websiteDetector');
const logger = require('../config/logger');

class UrlDetector {
  constructor(browser = null) {
    this.websiteDetector = new WebsiteDetector(browser);
  }

  /**
   * Detect company website from company name using WebsiteDetector
   */
  async detectWebsite(companyName) {
    try {
      logger.info(`Detecting website for: ${companyName}`);
      
      const website = await this.websiteDetector.detectWebsite(companyName);
      
      if (website) {
        logger.info(`Website detected: ${website}`);
        return website;
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
   * Detect website and get additional info
   */
  async detectWebsiteWithInfo(companyName) {
    try {
      logger.info(`Detecting website with info for: ${companyName}`);
      
      const website = await this.websiteDetector.detectWebsite(companyName);
      
      if (!website) {
        logger.warn(`Could not detect website for: ${companyName}`);
        return null;
      }

      const info = await this.websiteDetector.getWebsiteInfo(website);
      
      return {
        url: website,
        ...info
      };

    } catch (error) {
      logger.error(`Error in detectWebsiteWithInfo for ${companyName}:`, { 
        error: error.message 
      });
      return null;
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
  
  // Trim whitespace
  url = url.trim();
  
  // Extract URL from parentheses if present (e.g., "ãƒ†ãƒ« (teruyadenki.co.jp)" -> "teruyadenki.co.jp")
  const match = url.match(/\(([^)]+)\)/);
  if (match) {
    url = match[1].trim();
  }
  
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

  /**
   * Validate if a URL is accessible
   */
  async validateUrl(url) {
    return this.websiteDetector.quickValidate(url);
  }

  /**
   * Check if URL looks like official company site
   */
  static looksLikeOfficialSite(url, companyName) {
    const detector = new WebsiteDetector();
    return detector.looksLikeOfficialSite(url, companyName);
  }

  /**
   * Clean URL (remove tracking params, etc.)
   */
  static cleanUrl(url) {
    const detector = new WebsiteDetector();
    return detector.cleanUrl(url);
  }
}

module.exports = UrlDetector;