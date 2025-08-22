#!/usr/bin/env node

/**
 * Form Automation Example
 * 
 * This script demonstrates automated form filling and submission:
 * - Login forms
 * - Registration forms
 * - Contact forms
 * - Multi-step forms
 * - Form validation handling
 */

const { MCPClient } = require('@modelcontextprotocol/client');

class FormAutomator {
  constructor(serverUrl = 'http://localhost:3000') {
    this.client = new MCPClient();
    this.serverUrl = serverUrl;
  }

  async connect() {
    console.log('📡 Connecting to MCP server...');
    await this.client.connect(this.serverUrl);
    
    const context = await this.client.callTool('browser.newContext', {
      viewport: { width: 1280, height: 720 },
      userAgent: 'Mozilla/5.0 (compatible; FormAutomator/1.0)'
    });
    
    this.sessionId = context.sessionId;
    console.log(`✅ Connected with session: ${this.sessionId}\n`);
  }

  async disconnect() {
    await this.client.disconnect();
    console.log('✅ Disconnected from server');
  }

  async fillLoginForm(url, credentials) {
    console.log(`🔐 Automating login form at: ${url}`);
    
    // Navigate to login page
    await this.client.callTool('browser.goto', {
      url: url,
      waitUntil: 'networkidle'
    });

    // Take screenshot before filling
    await this.client.callTool('browser.screenshot', {
      format: 'png'
    });

    // Fill username/email field
    const usernameSelectors = [
      'input[name="username"]',
      'input[name="email"]',
      'input[type="email"]',
      '#username',
      '#email',
      '.username',
      '.email'
    ];

    const usernameField = await this.findWorkingSelector(usernameSelectors);
    if (usernameField) {
      console.log(`   📝 Filling username field: ${usernameField}`);
      await this.client.callTool('browser.type', {
        selector: usernameField,
        text: credentials.username
      });
    } else {
      throw new Error('Username field not found');
    }

    // Fill password field
    const passwordSelectors = [
      'input[name="password"]',
      'input[type="password"]',
      '#password',
      '.password'
    ];

    const passwordField = await this.findWorkingSelector(passwordSelectors);
    if (passwordField) {
      console.log(`   🔒 Filling password field: ${passwordField}`);
      await this.client.callTool('browser.type', {
        selector: passwordField,
        text: credentials.password
      });
    } else {
      throw new Error('Password field not found');
    }

    // Handle remember me checkbox if present
    const rememberMeSelectors = [
      'input[name="remember"]',
      'input[name="remember_me"]',
      '#remember',
      '#remember_me'
    ];

    const rememberMeField = await this.findWorkingSelector(rememberMeSelectors);
    if (rememberMeField && credentials.rememberMe) {
      console.log(`   ☑️  Checking remember me: ${rememberMeField}`);
      await this.client.callTool('browser.click', {
        selector: rememberMeField
      });
    }

    // Submit the form
    const submitSelectors = [
      'button[type="submit"]',
      'input[type="submit"]',
      'button:contains("Login")',
      'button:contains("Sign In")',
      '.login-button',
      '.submit-button',
      '#login-submit',
      '#submit'
    ];

    const submitButton = await this.findWorkingSelector(submitSelectors);
    if (submitButton) {
      console.log(`   🚀 Submitting form: ${submitButton}`);
      await this.client.callTool('browser.click', {
        selector: submitButton
      });
    } else {
      throw new Error('Submit button not found');
    }

    // Wait for navigation or error messages
    await this.delay(2000);

    // Check for success or error
    const result = await this.checkLoginResult();
    console.log(`   ${result.success ? '✅' : '❌'} Login result: ${result.message}`);

    return result;
  }

  async fillRegistrationForm(url, userData) {
    console.log(`📝 Automating registration form at: ${url}`);
    
    await this.client.callTool('browser.goto', {
      url: url,
      waitUntil: 'networkidle'
    });

    // Take screenshot
    await this.client.callTool('browser.screenshot', {
      format: 'png'
    });

    const fields = [
      { name: 'firstName', selectors: ['input[name="first_name"]', '#first_name', '.first-name'], value: userData.firstName },
      { name: 'lastName', selectors: ['input[name="last_name"]', '#last_name', '.last-name'], value: userData.lastName },
      { name: 'email', selectors: ['input[name="email"]', 'input[type="email"]', '#email'], value: userData.email },
      { name: 'username', selectors: ['input[name="username"]', '#username'], value: userData.username },
      { name: 'password', selectors: ['input[name="password"]', '#password'], value: userData.password },
      { name: 'confirmPassword', selectors: ['input[name="confirm_password"]', '#confirm_password'], value: userData.password },
      { name: 'phone', selectors: ['input[name="phone"]', 'input[type="tel"]', '#phone'], value: userData.phone },
      { name: 'dateOfBirth', selectors: ['input[name="dob"]', 'input[type="date"]', '#dob'], value: userData.dateOfBirth }
    ];

    for (const field of fields) {
      if (field.value) {
        const selector = await this.findWorkingSelector(field.selectors);
        if (selector) {
          console.log(`   📝 Filling ${field.name}: ${selector}`);
          await this.client.callTool('browser.type', {
            selector: selector,
            text: field.value
          });
          await this.delay(500); // Small delay between fields
        }
      }
    }

    // Handle dropdowns
    if (userData.country) {
      const countrySelector = await this.findWorkingSelector([
        'select[name="country"]',
        '#country',
        '.country-select'
      ]);
      
      if (countrySelector) {
        console.log(`   🌍 Selecting country: ${userData.country}`);
        await this.client.callTool('browser.select', {
          selector: countrySelector,
          value: userData.country
        });
      }
    }

    // Handle checkboxes (terms and conditions)
    if (userData.acceptTerms) {
      const termsSelector = await this.findWorkingSelector([
        'input[name="terms"]',
        'input[name="accept_terms"]',
        '#terms',
        '#accept_terms'
      ]);
      
      if (termsSelector) {
        console.log(`   ☑️  Accepting terms and conditions`);
        await this.client.callTool('browser.click', {
          selector: termsSelector
        });
      }
    }

    // Submit form
    const submitSelector = await this.findWorkingSelector([
      'button[type="submit"]',
      'input[type="submit"]',
      '.register-button',
      '.submit-button',
      '#register-submit'
    ]);

    if (submitSelector) {
      console.log(`   🚀 Submitting registration form`);
      await this.client.callTool('browser.click', {
        selector: submitSelector
      });
    }

    await this.delay(3000);

    const result = await this.checkRegistrationResult();
    console.log(`   ${result.success ? '✅' : '❌'} Registration result: ${result.message}`);

    return result;
  }

  async fillContactForm(url, contactData) {
    console.log(`📧 Automating contact form at: ${url}`);
    
    await this.client.callTool('browser.goto', {
      url: url,
      waitUntil: 'networkidle'
    });

    const fields = [
      { name: 'name', selectors: ['input[name="name"]', '#name', '.name'], value: contactData.name },
      { name: 'email', selectors: ['input[name="email"]', 'input[type="email"]', '#email'], value: contactData.email },
      { name: 'subject', selectors: ['input[name="subject"]', '#subject'], value: contactData.subject },
      { name: 'message', selectors: ['textarea[name="message"]', '#message', '.message'], value: contactData.message },
      { name: 'phone', selectors: ['input[name="phone"]', 'input[type="tel"]', '#phone'], value: contactData.phone }
    ];

    for (const field of fields) {
      if (field.value) {
        const selector = await this.findWorkingSelector(field.selectors);
        if (selector) {
          console.log(`   📝 Filling ${field.name}`);
          await this.client.callTool('browser.type', {
            selector: selector,
            text: field.value
          });
        }
      }
    }

    // Handle dropdowns (inquiry type, etc.)
    if (contactData.inquiryType) {
      const inquirySelector = await this.findWorkingSelector([
        'select[name="inquiry_type"]',
        'select[name="category"]',
        '#inquiry_type'
      ]);
      
      if (inquirySelector) {
        console.log(`   📋 Selecting inquiry type: ${contactData.inquiryType}`);
        await this.client.callTool('browser.select', {
          selector: inquirySelector,
          value: contactData.inquiryType
        });
      }
    }

    // Submit form
    const submitSelector = await this.findWorkingSelector([
      'button[type="submit"]',
      'input[type="submit"]',
      '.contact-submit',
      '.submit-button'
    ]);

    if (submitSelector) {
      console.log(`   🚀 Submitting contact form`);
      await this.client.callTool('browser.click', {
        selector: submitSelector
      });
    }

    await this.delay(2000);

    const result = await this.checkContactFormResult();
    console.log(`   ${result.success ? '✅' : '❌'} Contact form result: ${result.message}`);

    return result;
  }

  async handleMultiStepForm(url, formData) {
    console.log(`📋 Automating multi-step form at: ${url}`);
    
    await this.client.callTool('browser.goto', {
      url: url,
      waitUntil: 'networkidle'
    });

    let currentStep = 1;
    const maxSteps = formData.steps.length;

    for (const stepData of formData.steps) {
      console.log(`   📄 Processing step ${currentStep} of ${maxSteps}: ${stepData.title}`);

      // Fill fields for current step
      for (const field of stepData.fields) {
        const selector = await this.findWorkingSelector(field.selectors);
        if (selector && field.value) {
          console.log(`     📝 Filling ${field.name}`);
          
          if (field.type === 'select') {
            await this.client.callTool('browser.select', {
              selector: selector,
              value: field.value
            });
          } else if (field.type === 'checkbox') {
            if (field.value) {
              await this.client.callTool('browser.click', {
                selector: selector
              });
            }
          } else {
            await this.client.callTool('browser.type', {
              selector: selector,
              text: field.value
            });
          }
          
          await this.delay(300);
        }
      }

      // Click next button (or submit on last step)
      const isLastStep = currentStep === maxSteps;
      const buttonSelectors = isLastStep 
        ? ['button[type="submit"]', '.submit-button', '.finish-button']
        : ['.next-button', 'button:contains("Next")', '.continue-button'];

      const buttonSelector = await this.findWorkingSelector(buttonSelectors);
      if (buttonSelector) {
        console.log(`     🚀 Clicking ${isLastStep ? 'submit' : 'next'} button`);
        await this.client.callTool('browser.click', {
          selector: buttonSelector
        });
        
        await this.delay(2000);
      }

      currentStep++;
    }

    const result = await this.checkMultiStepFormResult();
    console.log(`   ${result.success ? '✅' : '❌'} Multi-step form result: ${result.message}`);

    return result;
  }

  async findWorkingSelector(selectors) {
    for (const selector of selectors) {
      const exists = await this.client.callTool('browser.eval', {
        code: `!!document.querySelector('${selector}')`
      });
      
      if (exists.value) {
        return selector;
      }
    }
    return null;
  }

  async checkLoginResult() {
    const result = await this.client.callTool('browser.eval', {
      code: `
        const currentUrl = window.location.href;
        const errorElements = document.querySelectorAll('.error, .alert-danger, .login-error');
        const successElements = document.querySelectorAll('.success, .alert-success, .welcome');
        
        // Check for common success indicators
        const hasSuccessMessage = successElements.length > 0;
        const urlChanged = !currentUrl.includes('login') && !currentUrl.includes('signin');
        const hasDashboard = currentUrl.includes('dashboard') || currentUrl.includes('profile');
        
        // Check for error messages
        const hasErrorMessage = errorElements.length > 0;
        const errorText = Array.from(errorElements).map(el => el.textContent.trim()).join('; ');
        
        return {
          success: (hasSuccessMessage || urlChanged || hasDashboard) && !hasErrorMessage,
          message: hasErrorMessage ? errorText : (hasSuccessMessage ? 'Login successful' : 'Login appears successful'),
          currentUrl: currentUrl
        };
      `
    });

    return result.value;
  }

  async checkRegistrationResult() {
    const result = await this.client.callTool('browser.eval', {
      code: `
        const errorElements = document.querySelectorAll('.error, .alert-danger, .validation-error');
        const successElements = document.querySelectorAll('.success, .alert-success, .registration-success');
        
        const hasErrorMessage = errorElements.length > 0;
        const hasSuccessMessage = successElements.length > 0;
        
        const errorText = Array.from(errorElements).map(el => el.textContent.trim()).join('; ');
        const successText = Array.from(successElements).map(el => el.textContent.trim()).join('; ');
        
        return {
          success: hasSuccessMessage && !hasErrorMessage,
          message: hasErrorMessage ? errorText : (hasSuccessMessage ? successText : 'Registration submitted'),
          currentUrl: window.location.href
        };
      `
    });

    return result.value;
  }

  async checkContactFormResult() {
    const result = await this.client.callTool('browser.eval', {
      code: `
        const successElements = document.querySelectorAll('.success, .alert-success, .thank-you, .message-sent');
        const errorElements = document.querySelectorAll('.error, .alert-danger');
        
        const hasSuccessMessage = successElements.length > 0;
        const hasErrorMessage = errorElements.length > 0;
        
        const successText = Array.from(successElements).map(el => el.textContent.trim()).join('; ');
        const errorText = Array.from(errorElements).map(el => el.textContent.trim()).join('; ');
        
        return {
          success: hasSuccessMessage && !hasErrorMessage,
          message: hasErrorMessage ? errorText : (hasSuccessMessage ? successText : 'Form submitted'),
          currentUrl: window.location.href
        };
      `
    });

    return result.value;
  }

  async checkMultiStepFormResult() {
    const result = await this.client.callTool('browser.eval', {
      code: `
        const completionElements = document.querySelectorAll('.completion, .success, .thank-you, .form-complete');
        const errorElements = document.querySelectorAll('.error, .alert-danger');
        
        const hasCompletionMessage = completionElements.length > 0;
        const hasErrorMessage = errorElements.length > 0;
        
        const completionText = Array.from(completionElements).map(el => el.textContent.trim()).join('; ');
        const errorText = Array.from(errorElements).map(el => el.textContent.trim()).join('; ');
        
        return {
          success: hasCompletionMessage && !hasErrorMessage,
          message: hasErrorMessage ? errorText : (hasCompletionMessage ? completionText : 'Multi-step form completed'),
          currentUrl: window.location.href
        };
      `
    });

    return result.value;
  }

  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Example usage
async function runFormAutomationExamples() {
  const automator = new FormAutomator();
  
  try {
    await automator.connect();

    // Example 1: Login form
    console.log('🔐 Example 1: Login Form Automation\n');
    
    const loginResult = await automator.fillLoginForm('https://example.com/login', {
      username: 'testuser@example.com',
      password: 'SecurePassword123!',
      rememberMe: true
    });

    // Example 2: Registration form
    console.log('\n📝 Example 2: Registration Form Automation\n');
    
    const registrationResult = await automator.fillRegistrationForm('https://example.com/register', {
      firstName: 'John',
      lastName: 'Doe',
      email: 'john.doe@example.com',
      username: 'johndoe',
      password: 'SecurePassword123!',
      phone: '+1-555-0123',
      dateOfBirth: '1990-01-01',
      country: 'US',
      acceptTerms: true
    });

    // Example 3: Contact form
    console.log('\n📧 Example 3: Contact Form Automation\n');
    
    const contactResult = await automator.fillContactForm('https://example.com/contact', {
      name: 'Jane Smith',
      email: 'jane.smith@example.com',
      subject: 'Product Inquiry',
      message: 'I would like more information about your products and services.',
      phone: '+1-555-0456',
      inquiryType: 'general'
    });

    // Example 4: Multi-step form
    console.log('\n📋 Example 4: Multi-Step Form Automation\n');
    
    const multiStepResult = await automator.handleMultiStepForm('https://example.com/application', {
      steps: [
        {
          title: 'Personal Information',
          fields: [
            { name: 'firstName', selectors: ['#first_name'], value: 'Alice', type: 'text' },
            { name: 'lastName', selectors: ['#last_name'], value: 'Johnson', type: 'text' },
            { name: 'email', selectors: ['#email'], value: 'alice@example.com', type: 'email' }
          ]
        },
        {
          title: 'Address Information',
          fields: [
            { name: 'address', selectors: ['#address'], value: '123 Main St', type: 'text' },
            { name: 'city', selectors: ['#city'], value: 'Anytown', type: 'text' },
            { name: 'state', selectors: ['#state'], value: 'CA', type: 'select' }
          ]
        },
        {
          title: 'Preferences',
          fields: [
            { name: 'newsletter', selectors: ['#newsletter'], value: true, type: 'checkbox' },
            { name: 'notifications', selectors: ['#notifications'], value: false, type: 'checkbox' }
          ]
        }
      ]
    });

    console.log('\n🎉 Form automation examples completed!');

  } catch (error) {
    console.error('❌ Form automation failed:', error.message);
    
    if (error.data) {
      console.error('   Category:', error.data.category);
      console.error('   Details:', error.data.details);
    }
  } finally {
    await automator.disconnect();
  }
}

// Command line interface
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
AI Browser MCP - Form Automation Example

Usage: node form-automation.js [OPTIONS]

Options:
  -h, --help            Show this help message
  --server-url URL      MCP server URL (default: http://localhost:3000)

Examples:
  node form-automation.js
  node form-automation.js --server-url http://localhost:3001
`);
    process.exit(0);
  }

  runFormAutomationExamples().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}