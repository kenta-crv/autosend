const logger = require('../config/logger');

class FormSubmitter {
  constructor(browser) {
    this.browser = browser;
    this.testData = {
      email: process.env.TEST_EMAIL || 'test@example.com',
      phone: process.env.TEST_PHONE || '+1234567890',
      website: process.env.TEST_WEBSITE || 'https://example.com',
      message: process.env.TEST_MESSAGE || 'This is a test submission from automated form filler.',
      firstname: 'Test',
      lastname: 'User',
      fullname: 'Test User',
      company: 'Test Company Inc.',
      subject: 'General Inquiry'
    };
  }

  /**
   * Fill and submit a contact form
   */
  async submitForm(url, formData) {
    let page;
    try {
      logger.info(`Submitting form at: ${url}`);
      page = await this.browser.newPage();
      
      // Set viewport and user agent
      await page.setViewport({ width: 1920, height: 1080 });
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      
      await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      // Wait for form to be fully loaded
      await page.waitForTimeout(2000);

      // Fill form fields
      const fillResults = await this.fillFormFields(page, formData);
      
      if (!fillResults.success) {
        await page.close();
        return {
          success: false,
          error: 'Failed to fill form fields',
          details: fillResults
        };
      }

      logger.info('Form fields filled successfully', { 
        filledCount: fillResults.filledCount 
      });

      // Check and handle acceptance checkboxes BEFORE submitting
      await this.handleAcceptanceCheckboxes(page);

      // Wait a bit for any validation
      await page.waitForTimeout(1000);

      // Handle CAPTCHA or reCAPTCHA detection
      const hasCaptcha = await this.detectCaptcha(page);
      if (hasCaptcha) {
        logger.warn('CAPTCHA detected, cannot auto-submit', { url });
        await page.close();
        return {
          success: false,
          error: 'CAPTCHA detected',
          hasCaptcha: true,
          fieldsFilledCount: fillResults.filledCount
        };
      }

      // Submit form
      const submitResult = await this.clickSubmitButton(page, formData);
      
      if (!submitResult.success) {
        await page.close();
        return {
          success: false,
          error: submitResult.error,
          fieldsFilledCount: fillResults.filledCount
        };
      }

      // Wait for submission response
      await page.waitForTimeout(3000);

      const finalUrl = page.url();
      const pageContent = await page.content();
      
      // Detect success indicators
      const successDetected = this.detectSuccessResponse(pageContent, finalUrl, url);
      
      await page.close();
      page = null;

      logger.info('Form submission completed', { 
        url,
        finalUrl,
        successDetected 
      });

      return {
        success: true,
        submittedAt: new Date().toISOString(),
        originalUrl: url,
        finalUrl: finalUrl,
        urlChanged: finalUrl !== url,
        successDetected: successDetected,
        fieldsFilledCount: fillResults.filledCount
      };

    } catch (error) {
      logger.error('Error submitting form:', { 
        url, 
        error: error.message,
        stack: error.stack 
      });
      return {
        success: false,
        error: error.message
      };
    } finally {
      if (page) {
        await page.close().catch(() => {});
      }
    }
  }

  /**
   * Handle acceptance/agreement checkboxes
   */
  async handleAcceptanceCheckboxes(page) {
    try {
      const checkboxesChecked = await page.evaluate(() => {
        let checkedCount = 0;
        
        // Find ALL checkboxes on the page
        const checkboxes = document.querySelectorAll('input[type="checkbox"]');
        
        checkboxes.forEach(checkbox => {
          if (!checkbox.checked && !checkbox.disabled) {
            checkbox.checked = true;
            checkbox.click(); // Trigger click event
            
            // Dispatch events to ensure form validation updates
            checkbox.dispatchEvent(new Event('change', { bubbles: true }));
            checkbox.dispatchEvent(new Event('input', { bubbles: true }));
            checkbox.dispatchEvent(new Event('click', { bubbles: true }));
            
            checkedCount++;
          }
        });
        
        return checkedCount;
      });

      if (checkboxesChecked > 0) {
        logger.info(`Checked ${checkboxesChecked} checkbox(es)`);
        // Wait a moment for form validation to process
        await page.waitForTimeout(500);
      }

      return checkboxesChecked;
    } catch (error) {
      logger.warn('Error handling checkboxes:', { error: error.message });
      return 0;
    }
  }

  /**
   * Fill all form fields
   */
  async fillFormFields(page, formData) {
    try {
      let filledCount = 0;
      const inputs = formData.inputs;

      for (const input of inputs) {
        try {
          const value = this.getValueForField(input);
          
          if (!value) {
            logger.debug(`Skipping field ${input.name || input.id} - no appropriate value`);
            continue;
          }

          // Try multiple strategies to fill the field
          let filled = false;

          // Strategy 1: Fill by ID
          if (input.id) {
            filled = await this.fillFieldById(page, input.id, value);
          }

          // Strategy 2: Fill by name
          if (!filled && input.name) {
            filled = await this.fillFieldByName(page, input.name, value);
          }

          // Strategy 3: Fill by selector
          if (!filled) {
            const selector = this.buildSelector(input);
            filled = await this.fillFieldBySelector(page, selector, value);
          }

          if (filled) {
            filledCount++;
            logger.debug(`Filled field: ${input.name || input.id} = "${value}"`);
          } else {
            logger.warn(`Could not fill field: ${input.name || input.id}`);
          }

        } catch (fieldError) {
          logger.warn(`Error filling field ${input.name || input.id}:`, { 
            error: fieldError.message 
          });
        }
      }

      return {
        success: filledCount > 0,
        filledCount: filledCount,
        totalFields: inputs.length
      };

    } catch (error) {
      logger.error('Error in fillFormFields:', { error: error.message });
      return {
        success: false,
        filledCount: 0,
        error: error.message
      };
    }
  }

  /**
   * Get appropriate value for a field
   */
  getValueForField(input) {
    const fieldType = input.fieldType || 'text';
    return this.testData[fieldType] || this.testData.message;
  }

  /**
   * Fill field by ID
   */
  async fillFieldById(page, id, value) {
    try {
      const element = await page.$(`#${CSS.escape(id)}`);
      if (!element) return false;

      await element.click();
      await element.evaluate(el => el.value = '');
      await element.type(value, { delay: 50 });
      
      // Trigger change events
      await element.evaluate(el => {
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      });

      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Fill field by name
   */
  async fillFieldByName(page, name, value) {
    try {
      const element = await page.$(`[name="${name}"]`);
      if (!element) return false;

      await element.click();
      await element.evaluate(el => el.value = '');
      await element.type(value, { delay: 50 });
      
      await element.evaluate(el => {
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      });

      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Fill field by selector
   */
  async fillFieldBySelector(page, selector, value) {
    try {
      const element = await page.$(selector);
      if (!element) return false;

      await element.click();
      await element.evaluate(el => el.value = '');
      await element.type(value, { delay: 50 });
      
      await element.evaluate(el => {
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      });

      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Build CSS selector for input
   */
  buildSelector(input) {
    if (input.tagName === 'textarea') {
      return 'textarea';
    }
    
    if (input.type) {
      return `input[type="${input.type}"]`;
    }
    
    return 'input';
  }

  /**
   * Detect if page has CAPTCHA
   */
  async detectCaptcha(page) {
    try {
      const hasCaptcha = await page.evaluate(() => {
        // Check for common CAPTCHA elements
        const recaptcha = document.querySelector('.g-recaptcha, [data-sitekey], .recaptcha');
        const hcaptcha = document.querySelector('.h-captcha');
        const turnstile = document.querySelector('.cf-turnstile');
        
        return !!(recaptcha || hcaptcha || turnstile);
      });

      return hasCaptcha;
    } catch (error) {
      return false;
    }
  }

  /**
   * Click submit button
   */
  async clickSubmitButton(page, formData) {
    try {
      const submitButtons = formData.submitButtons;
      
      if (!submitButtons || submitButtons.length === 0) {
        logger.warn('No submit button found in form data');
        return { success: false, error: 'No submit button found' };
      }

      // Check if submit button is still disabled
      const isDisabled = await page.evaluate(() => {
        const submitBtn = document.querySelector('input[type="submit"], button[type="submit"]');
        return submitBtn ? submitBtn.disabled : false;
      });

      if (isDisabled) {
        logger.warn('Submit button is still disabled - may need additional validation');
      }

      // Try to click the submit button
      const clicked = await page.evaluate((btnInfo) => {
        // Try by ID first
        if (btnInfo.id) {
          const btn = document.getElementById(btnInfo.id);
          if (btn && !btn.disabled) {
            btn.click();
            return true;
          }
        }

        // Try by button text
        const buttons = document.querySelectorAll('button[type="submit"], input[type="submit"], button');
        for (const btn of buttons) {
          if (btn.disabled) continue;
          
          const text = btn.textContent.toLowerCase() || btn.value.toLowerCase();
          if (text.includes('submit') || text.includes('send') || text.includes('contact') || text.includes('送信')) {
            btn.click();
            return true;
          }
        }

        return false;
      }, submitButtons[0]);

      if (clicked) {
        logger.info('Submit button clicked successfully');
        return { success: true };
      } else {
        logger.warn('Could not click submit button');
        return { success: false, error: 'Could not click submit button' };
      }

    } catch (error) {
      logger.error('Error clicking submit button:', { error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Detect success response
   */
  detectSuccessResponse(pageContent, finalUrl, originalUrl) {
    const content = pageContent.toLowerCase();
    
    // Check for success keywords
    const successKeywords = [
      'thank you',
      'thanks for',
      'message sent',
      'successfully submitted',
      'received your',
      'we\'ll get back',
      'we will get back',
      'contact you soon',
      'submission successful',
      'form submitted'
    ];

    const hasSuccessKeyword = successKeywords.some(keyword => content.includes(keyword));
    
    // Check if URL changed (often indicates successful submission)
    const urlChanged = finalUrl !== originalUrl;
    
    // Check for thank you page
    const isThankYouPage = finalUrl.includes('thank') || 
                          finalUrl.includes('success') || 
                          finalUrl.includes('confirmation');
    
    return hasSuccessKeyword || isThankYouPage || urlChanged;
  }
}

module.exports = FormSubmitter;