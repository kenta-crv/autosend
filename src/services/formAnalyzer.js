const logger = require('../config/logger');

class FormAnalyzer {
  constructor(browser) {
    this.browser = browser;
  }

  /**
   * Extract and analyze all input fields from a page
   * @param {string} url - The URL to analyze
   * @param {Page} existingPage - Optional existing page to reuse
   */
  async analyzeForm(url, existingPage = null) {
    let page = existingPage;
    const shouldClosePage = !existingPage; // Only close if we created it
    
    try {
      logger.info(`Analyzing form at: ${url}`);
      
      // Create new page only if one wasn't provided
      if (!page) {
        page = await this.browser.newPage();
        
        // Set viewport and user agent
        await page.setViewport({ width: 1920, height: 1080 });
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      }
      
      await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      // Wait for potential dynamic forms to load
      await page.waitForTimeout(2000);

      // Extract form information
      const formData = await page.evaluate(() => {
        const forms = [];
        const formElements = document.querySelectorAll('form');
        
        formElements.forEach((form, formIndex) => {
          const inputs = [];
          const elements = form.querySelectorAll('input, textarea, select');
          
          elements.forEach((el) => {
            // Skip hidden inputs and buttons
            if (el.type === 'hidden' || el.type === 'button' || el.type === 'submit') {
              return;
            }
            
            // Check if element is visible
            const rect = el.getBoundingClientRect();
            const isVisible = rect.width > 0 && rect.height > 0 && 
                            window.getComputedStyle(el).visibility !== 'hidden' &&
                            window.getComputedStyle(el).display !== 'none';
            
            if (!isVisible) return;
            
            // Get label text
            let label = '';
            if (el.id) {
              const labelEl = document.querySelector(`label[for="${el.id}"]`);
              if (labelEl) label = labelEl.textContent.trim();
            }
            if (!label) {
              const parentLabel = el.closest('label');
              if (parentLabel) label = parentLabel.textContent.trim();
            }
            
            inputs.push({
              tagName: el.tagName.toLowerCase(),
              type: el.type || 'text',
              name: el.name || '',
              id: el.id || '',
              placeholder: el.placeholder || '',
              label: label,
              required: el.required || false,
              pattern: el.pattern || '',
              minLength: el.minLength || null,
              maxLength: el.maxLength || null,
              className: el.className || '',
              autocomplete: el.autocomplete || ''
            });
          });
          
          // Get submit button info
          const submitButtons = [];
          const buttons = form.querySelectorAll('button[type="submit"], input[type="submit"], button:not([type])');
          buttons.forEach(btn => {
            const rect = btn.getBoundingClientRect();
            const isVisible = rect.width > 0 && rect.height > 0;
            
            if (isVisible) {
              submitButtons.push({
                type: btn.tagName.toLowerCase(),
                text: btn.textContent.trim() || btn.value || '',
                id: btn.id || '',
                className: btn.className || ''
              });
            }
          });
          
          forms.push({
            index: formIndex,
            action: form.action || '',
            method: form.method || 'post',
            id: form.id || '',
            className: form.className || '',
            inputs: inputs,
            submitButtons: submitButtons
          });
        });
        
        return forms;
      });

      // Analyze and categorize forms
      const analyzedForms = formData.map(form => this.categorizeForm(form));
      
      // Find the best form (likely to be contact form)
      const contactForm = this.findBestContactForm(analyzedForms);
      
      if (contactForm) {
        logger.info(`Found contact form with ${contactForm.inputs.length} fields`, {
          url,
          formIndex: contactForm.index,
          inputCount: contactForm.inputs.length
        });
      } else {
        logger.warn('No suitable contact form found', { url });
      }

      return {
        allForms: analyzedForms,
        contactForm: contactForm,
        totalForms: formData.length
      };

    } catch (error) {
      logger.error('Error analyzing form:', { 
        url, 
        error: error.message,
        stack: error.stack 
      });
      return {
        allForms: [],
        contactForm: null,
        totalForms: 0,
        error: error.message
      };
    } finally {
      // Only close page if we created it (not passed in)
      if (page && shouldClosePage) {
        await page.close().catch(() => {});
      }
    }
  }

  /**
   * Categorize form fields
   */
  categorizeForm(form) {
    const categorizedInputs = form.inputs.map(input => {
      const fieldType = this.detectFieldType(input);
      return { ...input, fieldType };
    });

    return {
      ...form,
      inputs: categorizedInputs,
      score: this.calculateFormScore(categorizedInputs, form.submitButtons)
    };
  }

  /**
   * Detect the semantic type of a field
   */
  detectFieldType(input) {
    const searchStr = `${input.name} ${input.id} ${input.placeholder} ${input.label} ${input.className} ${input.autocomplete}`.toLowerCase();
    
    // Email field
    if (input.type === 'email' || searchStr.match(/email|e-mail|mail/)) {
      return 'email';
    }
    
    // Phone field
    if (input.type === 'tel' || searchStr.match(/phone|tel|mobile|contact.*number/)) {
      return 'phone';
    }
    
    // Name fields
    if (searchStr.match(/^name$|full.*name|your.*name|contact.*name/)) {
      return 'fullname';
    }
    if (searchStr.match(/first.*name|fname|given.*name/)) {
      return 'firstname';
    }
    if (searchStr.match(/last.*name|lname|surname|family.*name/)) {
      return 'lastname';
    }
    
    // Company/Organization
    if (searchStr.match(/company|organization|organisation|business/)) {
      return 'company';
    }
    
    // Website/URL
    if (input.type === 'url' || searchStr.match(/website|url|site/)) {
      return 'website';
    }
    
    // Message/Comment
    if (input.tagName === 'textarea' || searchStr.match(/message|comment|inquiry|enquiry|details|description|question/)) {
      return 'message';
    }
    
    // Subject
    if (searchStr.match(/subject|topic|regarding/)) {
      return 'subject';
    }
    
    // Generic text
    return 'text';
  }

  /**
   * Calculate form relevance score
   */
  calculateFormScore(inputs, submitButtons) {
    let score = 0;
    
    // Check for essential contact form fields
    const hasEmail = inputs.some(i => i.fieldType === 'email');
    const hasMessage = inputs.some(i => i.fieldType === 'message');
    const hasName = inputs.some(i => ['fullname', 'firstname', 'lastname'].includes(i.fieldType));
    
    if (hasEmail) score += 30;
    if (hasMessage) score += 25;
    if (hasName) score += 20;
    
    // Reasonable number of fields (3-15 is typical for contact forms)
    if (inputs.length >= 3 && inputs.length <= 15) {
      score += 15;
    } else if (inputs.length > 15) {
      score -= 10; // Probably not a simple contact form
    }
    
    // Has submit button
    if (submitButtons.length > 0) {
      score += 10;
      
      // Check submit button text
      const btnText = submitButtons[0].text.toLowerCase();
      if (btnText.match(/submit|send|contact|inquire|enquire/)) {
        score += 5;
      }
    }
    
    return score;
  }

  /**
   * Find the most likely contact form
   */
  findBestContactForm(forms) {
    if (forms.length === 0) return null;
    
    // Sort by score
    forms.sort((a, b) => b.score - a.score);
    
    // Return form with highest score if it's above threshold
    if (forms[0].score >= 40) {
      return forms[0];
    }
    
    return null;
  }
}

module.exports = FormAnalyzer;