#!/usr/bin/env node

/**
 * Web Scraping Example
 * 
 * This script demonstrates advanced web scraping techniques:
 * - Scraping product listings from e-commerce sites
 * - Handling pagination
 * - Extracting structured data
 * - Saving results to JSON/CSV
 */

const { MCPClient } = require('@modelcontextprotocol/client');
const fs = require('fs').promises;
const path = require('path');

class WebScraper {
  constructor(serverUrl = 'http://localhost:3000') {
    this.client = new MCPClient();
    this.serverUrl = serverUrl;
    this.results = [];
  }

  async connect() {
    console.log('📡 Connecting to MCP server...');
    await this.client.connect(this.serverUrl);
    
    const context = await this.client.callTool('browser.newContext', {
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (compatible; WebScraper/1.0)'
    });
    
    this.sessionId = context.sessionId;
    console.log(`✅ Connected with session: ${this.sessionId}\n`);
  }

  async disconnect() {
    await this.client.disconnect();
    console.log('✅ Disconnected from server');
  }

  async scrapeProductListing(url, options = {}) {
    const {
      maxPages = 3,
      delay = 1000,
      selectors = {
        product: '.product-item',
        title: '.product-title',
        price: '.product-price',
        image: '.product-image img',
        link: 'a',
        nextPage: '.pagination .next'
      }
    } = options;

    console.log(`🔍 Scraping product listing: ${url}`);
    console.log(`   Max pages: ${maxPages}`);
    console.log(`   Delay between pages: ${delay}ms\n`);

    let currentPage = 1;
    let hasNextPage = true;

    while (currentPage <= maxPages && hasNextPage) {
      console.log(`📄 Scraping page ${currentPage}...`);
      
      // Navigate to the page
      await this.client.callTool('browser.goto', {
        url: currentPage === 1 ? url : url + `?page=${currentPage}`,
        waitUntil: 'networkidle'
      });

      // Wait for products to load
      await this.waitForElements(selectors.product);

      // Take screenshot for debugging
      await this.client.callTool('browser.screenshot', {
        fullPage: false,
        format: 'png'
      });

      // Extract products from current page
      const pageProducts = await this.extractProducts(selectors);
      console.log(`   Found ${pageProducts.length} products on page ${currentPage}`);

      this.results.push(...pageProducts);

      // Check for next page
      hasNextPage = await this.hasNextPage(selectors.nextPage);
      
      if (hasNextPage && currentPage < maxPages) {
        console.log(`   ⏳ Waiting ${delay}ms before next page...`);
        await this.delay(delay);
      }

      currentPage++;
    }

    console.log(`\n✅ Scraping completed! Total products: ${this.results.length}`);
    return this.results;
  }

  async extractProducts(selectors) {
    const products = await this.client.callTool('browser.eval', {
      code: `
        const products = [];
        const productElements = document.querySelectorAll('${selectors.product}');
        
        productElements.forEach((element, index) => {
          try {
            const titleElement = element.querySelector('${selectors.title}');
            const priceElement = element.querySelector('${selectors.price}');
            const imageElement = element.querySelector('${selectors.image}');
            const linkElement = element.querySelector('${selectors.link}');
            
            const product = {
              id: index + 1,
              title: titleElement ? titleElement.textContent.trim() : '',
              price: priceElement ? priceElement.textContent.trim() : '',
              image: imageElement ? imageElement.src : '',
              link: linkElement ? linkElement.href : '',
              scrapedAt: new Date().toISOString(),
              pageUrl: window.location.href
            };
            
            // Only add products with at least title and price
            if (product.title && product.price) {
              products.push(product);
            }
          } catch (error) {
            console.warn('Error extracting product:', error.message);
          }
        });
        
        return products;
      `
    });

    return products.value || [];
  }

  async waitForElements(selector, timeout = 10000) {
    await this.client.callTool('browser.eval', {
      code: `
        return new Promise((resolve, reject) => {
          const startTime = Date.now();
          
          const checkElements = () => {
            const elements = document.querySelectorAll('${selector}');
            
            if (elements.length > 0) {
              resolve(elements.length);
            } else if (Date.now() - startTime > ${timeout}) {
              reject(new Error('Timeout waiting for elements: ${selector}'));
            } else {
              setTimeout(checkElements, 100);
            }
          };
          
          checkElements();
        });
      `
    });
  }

  async hasNextPage(nextPageSelector) {
    const nextPageExists = await this.client.callTool('browser.eval', {
      code: `
        const nextButton = document.querySelector('${nextPageSelector}');
        return nextButton && !nextButton.disabled && nextButton.offsetParent !== null;
      `
    });

    return nextPageExists.value || false;
  }

  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async saveResults(format = 'json', filename = null) {
    if (this.results.length === 0) {
      console.log('⚠️  No results to save');
      return;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const defaultFilename = `scraped-products-${timestamp}`;
    const outputFile = filename || `${defaultFilename}.${format}`;

    console.log(`💾 Saving ${this.results.length} products to ${outputFile}...`);

    try {
      if (format === 'json') {
        await fs.writeFile(
          outputFile,
          JSON.stringify(this.results, null, 2),
          'utf8'
        );
      } else if (format === 'csv') {
        const csv = this.convertToCSV(this.results);
        await fs.writeFile(outputFile, csv, 'utf8');
      }

      console.log(`✅ Results saved to ${outputFile}`);
      return outputFile;
    } catch (error) {
      console.error('❌ Error saving results:', error.message);
      throw error;
    }
  }

  convertToCSV(data) {
    if (data.length === 0) return '';

    const headers = Object.keys(data[0]);
    const csvHeaders = headers.join(',');
    
    const csvRows = data.map(row => {
      return headers.map(header => {
        const value = row[header] || '';
        // Escape quotes and wrap in quotes if contains comma
        const escaped = value.toString().replace(/"/g, '""');
        return escaped.includes(',') ? `"${escaped}"` : escaped;
      }).join(',');
    });

    return [csvHeaders, ...csvRows].join('\n');
  }

  generateReport() {
    if (this.results.length === 0) {
      console.log('📊 No data to report');
      return;
    }

    console.log('\n📊 Scraping Report:');
    console.log(`   Total products: ${this.results.length}`);
    
    // Price analysis
    const prices = this.results
      .map(p => p.price)
      .filter(p => p)
      .map(p => parseFloat(p.replace(/[^0-9.]/g, '')))
      .filter(p => !isNaN(p));

    if (prices.length > 0) {
      const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
      const minPrice = Math.min(...prices);
      const maxPrice = Math.max(...prices);
      
      console.log(`   Price range: $${minPrice.toFixed(2)} - $${maxPrice.toFixed(2)}`);
      console.log(`   Average price: $${avgPrice.toFixed(2)}`);
    }

    // Title analysis
    const titles = this.results.map(p => p.title).filter(t => t);
    const avgTitleLength = titles.reduce((sum, title) => sum + title.length, 0) / titles.length;
    console.log(`   Average title length: ${avgTitleLength.toFixed(0)} characters`);

    // Image analysis
    const withImages = this.results.filter(p => p.image).length;
    console.log(`   Products with images: ${withImages} (${((withImages / this.results.length) * 100).toFixed(1)}%)`);

    console.log();
  }
}

// Example usage
async function runScrapingExample() {
  const scraper = new WebScraper();
  
  try {
    await scraper.connect();

    // Example 1: Scrape a mock e-commerce site
    console.log('🛍️  Example 1: E-commerce Product Scraping\n');
    
    await scraper.scrapeProductListing('https://scrapeme.live/shop/', {
      maxPages: 2,
      delay: 2000,
      selectors: {
        product: '.product',
        title: '.woocommerce-loop-product__title',
        price: '.price',
        image: '.attachment-woocommerce_thumbnail',
        link: 'a',
        nextPage: '.next'
      }
    });

    // Generate report
    scraper.generateReport();

    // Save results
    await scraper.saveResults('json');
    await scraper.saveResults('csv');

    console.log('\n🎉 Scraping example completed successfully!');

  } catch (error) {
    console.error('❌ Scraping failed:', error.message);
    
    if (error.data) {
      console.error('   Category:', error.data.category);
      console.error('   Details:', error.data.details);
    }
  } finally {
    await scraper.disconnect();
  }
}

// Command line interface
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
AI Browser MCP - Web Scraping Example

Usage: node web-scraping.js [OPTIONS]

Options:
  -h, --help            Show this help message
  --url URL             Target URL to scrape
  --pages N             Maximum pages to scrape (default: 3)
  --delay MS            Delay between pages in milliseconds (default: 1000)
  --format FORMAT       Output format: json or csv (default: json)
  --output FILE         Output filename
  --server-url URL      MCP server URL (default: http://localhost:3000)

Examples:
  node web-scraping.js
  node web-scraping.js --url https://example-shop.com --pages 5
  node web-scraping.js --format csv --output products.csv
`);
  process.exit(0);
}

// Parse command line arguments
const config = {
  url: args.find((arg, i) => args[i-1] === '--url') || 'https://scrapeme.live/shop/',
  maxPages: parseInt(args.find((arg, i) => args[i-1] === '--pages')) || 3,
  delay: parseInt(args.find((arg, i) => args[i-1] === '--delay')) || 1000,
  format: args.find((arg, i) => args[i-1] === '--format') || 'json',
  output: args.find((arg, i) => args[i-1] === '--output'),
  serverUrl: args.find((arg, i) => args[i-1] === '--server-url') || 'http://localhost:3000'
};

// Run with custom configuration
async function runWithConfig() {
  const scraper = new WebScraper(config.serverUrl);
  
  try {
    await scraper.connect();
    
    await scraper.scrapeProductListing(config.url, {
      maxPages: config.maxPages,
      delay: config.delay
    });
    
    scraper.generateReport();
    await scraper.saveResults(config.format, config.output);
    
  } catch (error) {
    console.error('❌ Scraping failed:', error.message);
    process.exit(1);
  } finally {
    await scraper.disconnect();
  }
}

// Run the example
if (require.main === module) {
  runWithConfig().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}