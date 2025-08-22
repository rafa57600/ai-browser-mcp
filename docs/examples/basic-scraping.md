# Basic Web Scraping Example

This example demonstrates how to scrape data from a web page using the AI Browser MCP server.

## Overview

We'll scrape product information from an e-commerce page, including:
- Product titles
- Prices
- Descriptions
- Images

## Prerequisites

- AI Browser MCP server running on localhost:3000
- Node.js with MCP client library

## Complete Example

```javascript
const { MCPClient } = require('@modelcontextprotocol/client');

async function scrapeProductData() {
  const client = new MCPClient();
  
  try {
    // Connect to the MCP server
    await client.connect('http://localhost:3000');
    
    // Create a new browser context
    const context = await client.callTool('browser.newContext', {
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (compatible; AI-Scraper/1.0)'
    });
    
    console.log('Browser context created:', context.sessionId);
    
    // Navigate to the target page
    const navigation = await client.callTool('browser.goto', {
      url: 'https://example-shop.com/products',
      waitUntil: 'networkidle'
    });
    
    console.log('Navigated to:', navigation.url);
    
    // Take a screenshot for reference
    const screenshot = await client.callTool('browser.screenshot', {
      fullPage: true,
      format: 'png'
    });
    
    console.log('Screenshot captured:', screenshot.width + 'x' + screenshot.height);
    
    // Extract product data using JavaScript
    const productData = await client.callTool('browser.eval', {
      code: `
        const products = [];
        const productElements = document.querySelectorAll('.product-card');
        
        productElements.forEach(element => {
          const title = element.querySelector('.product-title')?.textContent?.trim();
          const price = element.querySelector('.product-price')?.textContent?.trim();
          const description = element.querySelector('.product-description')?.textContent?.trim();
          const imageUrl = element.querySelector('.product-image')?.src;
          
          if (title && price) {
            products.push({
              title,
              price,
              description: description || '',
              imageUrl: imageUrl || ''
            });
          }
        });
        
        return products;
      `
    });
    
    console.log('Products found:', productData.value.length);
    
    // Process and display the scraped data
    productData.value.forEach((product, index) => {
      console.log(`\nProduct ${index + 1}:`);
      console.log(`  Title: ${product.title}`);
      console.log(`  Price: ${product.price}`);
      console.log(`  Description: ${product.description.substring(0, 100)}...`);
      console.log(`  Image: ${product.imageUrl}`);
    });
    
    // Get network activity for debugging
    const networkLogs = await client.callTool('browser.network.getRecent', {
      limit: 10
    });
    
    console.log('\nNetwork requests:', networkLogs.length);
    networkLogs.forEach(log => {
      console.log(`  ${log.method} ${log.url} - ${log.status}`);
    });
    
    return productData.value;
    
  } catch (error) {
    console.error('Scraping failed:', error);
    throw error;
  } finally {
    // Clean up
    await client.disconnect();
  }
}

// Run the scraper
scrapeProductData()
  .then(products => {
    console.log(`\nScraping completed successfully! Found ${products.length} products.`);
  })
  .catch(error => {
    console.error('Scraping failed:', error.message);
    process.exit(1);
  });
```

## Step-by-Step Breakdown

### 1. Connect to MCP Server

```javascript
const client = new MCPClient();
await client.connect('http://localhost:3000');
```

### 2. Create Browser Context

```javascript
const context = await client.callTool('browser.newContext', {
  viewport: { width: 1920, height: 1080 },
  userAgent: 'Mozilla/5.0 (compatible; AI-Scraper/1.0)'
});
```

### 3. Navigate to Target Page

```javascript
const navigation = await client.callTool('browser.goto', {
  url: 'https://example-shop.com/products',
  waitUntil: 'networkidle'
});
```

### 4. Extract Data with JavaScript

```javascript
const productData = await client.callTool('browser.eval', {
  code: `
    // Your data extraction logic here
    return extractedData;
  `
});
```

## Error Handling

```javascript
try {
  const result = await client.callTool('browser.goto', {
    url: 'https://example.com'
  });
} catch (error) {
  if (error.data?.category === 'security') {
    console.log('Domain not allowed:', error.message);
  } else if (error.data?.category === 'browser') {
    console.log('Navigation failed:', error.message);
  } else {
    console.log('Unexpected error:', error.message);
  }
}
```

## Best Practices

### 1. Wait for Content to Load

```javascript
// Wait for specific elements
await client.callTool('browser.eval', {
  code: `
    return new Promise(resolve => {
      const checkForContent = () => {
        if (document.querySelectorAll('.product-card').length > 0) {
          resolve(true);
        } else {
          setTimeout(checkForContent, 100);
        }
      };
      checkForContent();
    });
  `
});
```

### 2. Handle Dynamic Content

```javascript
// Wait for AJAX content to load
await client.callTool('browser.eval', {
  code: `
    return new Promise(resolve => {
      const observer = new MutationObserver(mutations => {
        if (document.querySelector('.dynamic-content')) {
          observer.disconnect();
          resolve(true);
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    });
  `
});
```

### 3. Respect Rate Limits

```javascript
// Add delays between requests
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

for (const url of urls) {
  await client.callTool('browser.goto', { url });
  // Process page...
  await delay(1000); // Wait 1 second between pages
}
```

## Common Issues and Solutions

### Issue: Elements Not Found
**Solution**: Add explicit waits or check for element existence

```javascript
const elementExists = await client.callTool('browser.eval', {
  code: `!!document.querySelector('.target-element')`
});

if (!elementExists.value) {
  console.log('Element not found, skipping...');
  return;
}
```

### Issue: JavaScript Errors
**Solution**: Wrap extraction code in try-catch

```javascript
const safeExtraction = await client.callTool('browser.eval', {
  code: `
    try {
      // Your extraction code
      return { success: true, data: extractedData };
    } catch (error) {
      return { success: false, error: error.message };
    }
  `
});
```

### Issue: Network Timeouts
**Solution**: Increase timeout values

```javascript
await client.callTool('browser.goto', {
  url: 'https://slow-site.com',
  timeout: 60000 // 60 seconds
});
```

## Output Example

```
Browser context created: session_abc123
Navigated to: https://example-shop.com/products
Screenshot captured: 1920x1080
Products found: 12

Product 1:
  Title: Wireless Headphones
  Price: $99.99
  Description: High-quality wireless headphones with noise cancellation...
  Image: https://example-shop.com/images/headphones.jpg

Product 2:
  Title: Smartphone Case
  Price: $24.99
  Description: Durable protective case for smartphones...
  Image: https://example-shop.com/images/case.jpg

Network requests: 10
  GET https://example-shop.com/products - 200
  GET https://example-shop.com/api/products - 200
  GET https://example-shop.com/css/styles.css - 200

Scraping completed successfully! Found 12 products.
```