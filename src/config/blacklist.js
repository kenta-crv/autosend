/**
 * Blacklist Configuration
 * Add domains or URL patterns that should be blocked from processing
 */

const BLACKLISTED_DOMAINS = [
 
  'jp.indeed.com',
 
  // Add more domains as needed
];

const BLACKLISTED_PATTERNS = [
  /indeed\.com/i,
 
  // Add regex patterns for more complex matching
];

class Blacklist {
  /**
   * Check if a URL is blacklisted
   * @param {string} url - The URL to check
   * @returns {object} - {isBlacklisted: boolean, reason: string|null}
   */
  static isBlacklisted(url) {
    if (!url) {
      return { isBlacklisted: false, reason: null };
    }

    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.toLowerCase();

      // Check exact domain matches
      for (const domain of BLACKLISTED_DOMAINS) {
        if (hostname === domain || hostname.endsWith(`.${domain}`)) {
          return {
            isBlacklisted: true,
            reason: `Domain '${domain}' is blacklisted`
          };
        }
      }

      // Check pattern matches
      // for (const pattern of BLACKLISTED_PATTERNS) {
      //   if (pattern.test(url)) {
      //     return {
      //       isBlacklisted: true,
      //       reason: `URL matches blacklisted pattern: ${pattern}`
      //     };
      //   }
      // }

      return { isBlacklisted: false, reason: null };
    } catch (error) {
      // Invalid URL
      return { isBlacklisted: false, reason: null };
    }
  }

  /**
   * Get all blacklisted domains
   */
  static getBlacklistedDomains() {
    return [...BLACKLISTED_DOMAINS];
  }

 
}

module.exports = Blacklist;