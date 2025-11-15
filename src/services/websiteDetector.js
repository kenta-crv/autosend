const puppeteer = require('puppeteer');
const axios = require('axios');
const cheerio = require('cheerio');
const logger = require('../config/logger');

class WebsiteDetector {
  constructor(browser = null) {
    this.browser = browser;
  }

  /**
   * Main method to detect website from company name
   */
  async detectWebsite(companyName) {
    try {
      logger.info(`Starting website detection for: ${companyName}`);

      // Strategy 1: Try common domain patterns (fastest)
      let website = await this.tryCommonPatterns(companyName);
      if (website) {
        logger.info(`Found via common patterns: ${website}`);
        return website;
      }

      // Strategy 2: Use Google search via Puppeteer
      if (this.browser) {
        website = await this.searchWithPuppeteer(companyName);
        if (website) {
          logger.info(`Found via Google search: ${website}`);
          return website;
        }
      }

      // Strategy 3: Use DuckDuckGo HTML search (no JS required)
      website = await this.searchDuckDuckGo(companyName);
      if (website) {
        logger.info(`Found via DuckDuckGo: ${website}`);
        return website;
      }

      // Strategy 4: Try domain variations with multiple TLDs
      website = await this.tryDomainVariations(companyName);
      if (website) {
        logger.info(`Found via domain variations: ${website}`);
        return website;
      }

      logger.warn(`Could not detect website for: ${companyName}`);
      return null;

    } catch (error) {
      logger.error(`Error in detectWebsite for ${companyName}:`, { 
        error: error.message,
        stack: error.stack 
      });
      return null;
    }
  }

  /**
   * Try common domain patterns
   */
  async tryCommonPatterns(companyName) {
    const variations = this.generateDomainVariations(companyName);
    
    logger.debug(`Trying ${variations.length} domain patterns...`);

    for (const domain of variations) {
      try {
        const isValid = await this.quickValidate(domain);
        if (isValid) {
          return domain;
        }
      } catch (error) {
        continue;
      }
    }

    return null;
  }

  /**
   * Generate domain variations from company name
   */
  generateDomainVariations(companyName) {
    const clean = companyName.toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+(inc|llc|ltd|limited|corp|corporation|company|co|group|international|global)$/i, '')
      .trim();

    const words = clean.split(/\s+/);
    const firstWord = words[0];
    const acronym = words.map(w => w[0]).join('');

    const patterns = [
      clean.replace(/\s+/g, ''),           // companyname
      clean.replace(/\s+/g, '-'),          // company-name
      clean.replace(/\s+/g, ''),           // companyname
      firstWord,                            // first word only
      acronym,                              // ABC for A B C
    ];

    const tlds = ['.com', '.io', '.co', '.net', '.org', '.ai'];
    const variations = [];

    for (const pattern of [...new Set(patterns)]) { // Remove duplicates
      if (pattern.length < 2) continue;
      
      for (const tld of tlds) {
        variations.push(`https://www.${pattern}${tld}`);
        variations.push(`https://${pattern}${tld}`);
      }
    }

    return variations;
  }

  /**
   * Quick URL validation (HEAD request)
   */
  async quickValidate(url) {
    try {
      const response = await axios.head(url, {
        timeout: 3000,
        maxRedirects: 5,
        validateStatus: (status) => status >= 200 && status < 400
      });
      
      return response.status >= 200 && response.status < 400;
    } catch (error) {
      return false;
    }
  }

  /**
   * Search using Google via Puppeteer
   */
  async searchWithPuppeteer(companyName) {
    let page;
    try {
      if (!this.browser) return null;

      logger.info(`Searching Google for: ${companyName}`);
      
      page = await this.browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      
      const searchQuery = encodeURIComponent(`${companyName} official website`);
      await page.goto(`https://www.google.com/search?q=${searchQuery}`, {
        waitUntil: 'domcontentloaded',
        timeout: 15000
      });

      // Wait for results
      await page.waitForTimeout(2000);

      // Extract URLs from search results
      const results = await page.evaluate(() => {
        const links = [];
        const searchResults = document.querySelectorAll('a[href]');
        
        for (const link of searchResults) {
          const href = link.href;
          // Filter out Google's own URLs
          if (href && !href.includes('google.com') && href.startsWith('http')) {
            links.push(href);
          }
        }
        
        return links.slice(0, 5); // First 5 results
      });

      await page.close();
      page = null;

      // Validate results
      for (const url of results) {
        try {
          const cleanUrl = this.cleanUrl(url);
          if (!cleanUrl) continue;

          const isValid = await this.quickValidate(cleanUrl);
          if (isValid && this.looksLikeOfficialSite(cleanUrl, companyName)) {
            return cleanUrl;
          }
        } catch (error) {
          continue;
        }
      }

      return null;

    } catch (error) {
      logger.debug(`Google search failed:`, { error: error.message });
      return null;
    } finally {
      if (page) {
        await page.close().catch(() => {});
      }
    }
  }

  /**
   * Search using DuckDuckGo HTML (no API key needed)
   */
  async searchDuckDuckGo(companyName) {
    try {
      logger.info(`Searching DuckDuckGo for: ${companyName}`);
      
      const searchQuery = encodeURIComponent(`${companyName} official website`);
      const searchUrl = `https://html.duckduckgo.com/html/?q=${searchQuery}`;
      
      const response = await axios.get(searchUrl, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      const $ = cheerio.load(response.data);
      const results = [];

      // Extract result URLs
      $('.result__url').each((i, elem) => {
        if (i < 5) {
          let url = $(elem).text().trim();
          if (url && !url.includes('duckduckgo.com')) {
            results.push(url);
          }
        }
      });

      // Also try links
      $('.result__a').each((i, elem) => {
        if (i < 5) {
          const href = $(elem).attr('href');
          if (href && href.startsWith('http') && !href.includes('duckduckgo.com')) {
            results.push(href);
          }
        }
      });

      // Validate results
      for (const resultUrl of results) {
        try {
          let cleanUrl = resultUrl;
          if (!cleanUrl.startsWith('http')) {
            cleanUrl = 'https://' + cleanUrl;
          }

          cleanUrl = this.cleanUrl(cleanUrl);
          if (!cleanUrl) continue;

          const isValid = await this.quickValidate(cleanUrl);
          if (isValid && this.looksLikeOfficialSite(cleanUrl, companyName)) {
            return cleanUrl;
          }
        } catch (error) {
          continue;
        }
      }

      return null;

    } catch (error) {
      logger.debug(`DuckDuckGo search failed:`, { error: error.message });
      return null;
    }
  }

  /**
   * Try domain variations with different TLDs
   */
  async tryDomainVariations(companyName) {
    const clean = companyName.toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+(inc|llc|ltd|corp|company)$/i, '')
      .trim();

    const words = clean.split(/\s+/);
    const firstWord = words[0];
    const firstTwo = words.slice(0, 2).join('');

    const patterns = [
      clean.replace(/\s+/g, ''),
      clean.replace(/\s+/g, '-'),
      firstWord,
      firstTwo
    ];

    const tlds = ['.com', '.io', '.net', '.org', '.co', '.ai', '.us', '.info'];

    for (const pattern of patterns) {
      if (pattern.length < 3) continue;

      for (const tld of tlds) {
        const domain = `https://${pattern}${tld}`;
        try {
          const isValid = await this.quickValidate(domain);
          if (isValid) {
            return domain;
          }
        } catch (error) {
          continue;
        }
      }
    }

    return null;
  }

  /**
   * Clean URL (remove tracking params, etc.)
   */
  cleanUrl(url) {
    try {
      const urlObj = new URL(url);
      
      // Remove common tracking parameters
      urlObj.search = '';
      urlObj.hash = '';
      
      let cleanUrl = urlObj.origin;
      
      // Keep path if it's short and looks like a homepage
      if (urlObj.pathname && urlObj.pathname.length < 50 && urlObj.pathname !== '/') {
        const pathParts = urlObj.pathname.split('/').filter(Boolean);
        if (pathParts.length <= 2) {
          cleanUrl = urlObj.origin + urlObj.pathname;
        }
      }
      
      return cleanUrl;
    } catch (error) {
      return null;
    }
  }

  /**
   * Check if URL looks like official company site
   */
  looksLikeOfficialSite(url, companyName) {
    try {
      const urlLower = url.toLowerCase();
      const nameLower = companyName.toLowerCase();
      
      // Clean company name
      const cleanName = nameLower
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+(inc|llc|ltd|corp|company|group|international)$/i, '')
        .trim();
      
      const nameWords = cleanName.split(/\s+/).filter(w => w.length > 2);
      
      // Must contain at least one significant word from company name
      const hasNameWord = nameWords.some(word => 
        word.length > 3 && urlLower.includes(word)
      );
      
      if (!hasNameWord) return false;

      // Exclude non-official sites
      const excludePatterns = [
        'facebook.com', 'twitter.com', 'linkedin.com', 'instagram.com',
        'youtube.com', 'wikipedia.org', 'yelp.com', 'yellowpages',
        'bbb.org', 'crunchbase.com', 'bloomberg.com', 'reuters.com',
        'indeed.com', 'glassdoor.com', 'trustpilot', 'reddit.com',
        'quora.com', 'amazon.com', 'ebay.com', 'aliexpress'
      ];
      
      for (const pattern of excludePatterns) {
        if (urlLower.includes(pattern)) {
          return false;
        }
      }
      
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get website info (validate and get details)
   */
  async getWebsiteInfo(url) {
    try {
      const response = await axios.get(url, {
        timeout: 10000,
        maxRedirects: 5,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      const $ = cheerio.load(response.data);
      
      return {
        url: response.request.res.responseUrl || url,
        title: $('title').text().trim(),
        description: $('meta[name="description"]').attr('content') || '',
        hasContactInfo: response.data.toLowerCase().includes('contact'),
        statusCode: response.status
      };

    } catch (error) {
      logger.debug(`Failed to get website info for ${url}:`, { error: error.message });
      return null;
    }
  }
}

module.exports = WebsiteDetector;