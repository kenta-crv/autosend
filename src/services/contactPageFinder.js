const logger = require('../config/logger');

class ContactPageFinder {
  constructor(browser) {
    this.browser = browser;
    this.commonPaths = [
      '/contact/',
      '/contact-us/',
      '/contactus/',
      '/get-in-touch/',
      '/contact',
      '/reach-us/',
      '/inquiry/',
      '/support/',
      '/contact-form/',
      '/connect/',
      '/touch/',
      '/enquiry/',
      '/enquiries/'
    ];
  }

  /**
   * Find contact page by trying common URL patterns
   */
  async findByDirectUrl(homepage) {
    try {
      const baseUrl = new URL(homepage);
      logger.info(`Trying direct URL patterns for: ${baseUrl.origin}`);

      for (const path of this.commonPaths) {
        const testUrl = `${baseUrl.origin}${path}`;
        
        try {
          const page = await this.browser.newPage();
          
          // Set viewport and user agent
          await page.setViewport({ width: 1920, height: 1080 });
          await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
          
          const response = await page.goto(testUrl, { 
            timeout: 15000,
            waitUntil: 'domcontentloaded'
          });
          
          const isValid = response && response.status() === 200;
          await page.close();
          
          if (isValid) {
            logger.info(`Contact page found via direct URL: ${testUrl}`);
            return testUrl;
          }
        } catch (error) {
          logger.debug(`Direct URL failed: ${testUrl}`, { error: error.message });
        }
      }

      return null;
    } catch (error) {
      logger.error('Error in findByDirectUrl:', { error: error.message });
      return null;
    }
  }

  /**
   * Find contact page by analyzing homepage links
   */
  async findByHomepageLinks(homepage) {
    let page;
    try {
      logger.info(`Analyzing homepage links: ${homepage}`);
      page = await this.browser.newPage();
      
      // Set viewport and user agent
      await page.setViewport({ width: 1920, height: 1080 });
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      
      await page.goto(homepage, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      // Extract all links
      const links = await page.evaluate(() => {
        const result = [];
        const anchors = document.querySelectorAll('a[href]');
        
        for (const anchor of anchors) {
          const text = (anchor.textContent || '').trim().toLowerCase();
          const href = anchor.href;
          const ariaLabel = (anchor.getAttribute('aria-label') || '').toLowerCase();
          
          result.push({ text, href, ariaLabel });
        }
        
        return result;
      });

      await page.close();
      page = null;

      if (!links || links.length === 0) {
        logger.warn('No links found on homepage');
        return null;
      }

      logger.debug(`Found ${links.length} links on homepage`);

      // Search for contact-related links with improved matching
      const contactKeywords = ['contact', 'reach', 'touch', 'inquiry', 'inquire', 'enquiry', 'support', 'connect'];
      
      for (const link of links) {
        const searchText = `${link.text} ${link.ariaLabel} ${link.href}`.toLowerCase();
        
        // Check if link contains contact keywords
        const hasContactKeyword = contactKeywords.some(keyword => searchText.includes(keyword));
        
        // Exclude non-contact pages
        const isExcluded = searchText.includes('career') || 
                          searchText.includes('job') || 
                          searchText.includes('press') ||
                          searchText.includes('media') ||
                          searchText.includes('blog');
        
        if (hasContactKeyword && !isExcluded) {
          logger.info(`Contact page found via homepage link: ${link.href}`);
          return link.href;
        }
      }

      logger.warn('No contact page found in homepage links');
      return null;

    } catch (error) {
      logger.error('Error in findByHomepageLinks:', { error: error.message });
      return null;
    } finally {
      if (page) {
        await page.close().catch(() => {});
      }
    }
  }

  /**
   * Find contact page using both methods
   */
  async findContactPage(homepage) {
    try {
      logger.info(`Finding contact page for: ${homepage}`);

      // Method 1: Analyze homepage links (primary method)
      const linkResult = await this.findByHomepageLinks(homepage);
      if (linkResult) {
        return linkResult;
      }

      // Method 2: Try direct URLs (fallback)
      logger.info('Homepage link analysis failed, trying direct URL method...');
      const directResult = await this.findByDirectUrl(homepage);
      
      return directResult;

    } catch (error) {
      logger.error('Error finding contact page:', { 
        homepage, 
        error: error.message,
        stack: error.stack 
      });
      return null;
    }
  }
}

module.exports = ContactPageFinder;