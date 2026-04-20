const { chromium } = require('playwright');

const items = [
  { query: 'organic butter', original: 'butter' },
  { query: 'organic strawberries', original: 'Organic strawberries' },
  { query: 'organic fresh blueberries', original: 'Fresh blueberries' },
  { query: 'organic eggs 2 dozen', original: '2 dozen eggs' },
  { query: 'english muffins', original: 'English muffins' },
];

(async () => {
  const browser = await chromium.launch({ 
    headless: false,
    args: [
      '--disable-http2',
      '--no-sandbox',
      '--disable-blink-features=AutomationControlled',
    ]
  });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
  });

  const page = await context.newPage();
  
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });
  
  console.log('Visiting Costco homepage...');
  await page.goto('https://www.costco.com/', { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForTimeout(3000);

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    console.log(`\n--- Searching for: ${item.query} ---`);
    
    try {
      // Find and use the search box
      const searchInput = await page.$('#search-field, input[name="keyword"], input[type="search"], #header-search-input');
      if (!searchInput) {
        console.log('Could not find search box');
        // Take screenshot to see what's on the page
        await page.screenshot({ path: `/Users/ian.bartholomew/Dev/family-assistant/costco-nosearch-${i}.png` });
        continue;
      }
      
      // Clear and type
      await searchInput.click({ clickCount: 3 });
      await page.waitForTimeout(500);
      await searchInput.fill(item.query);
      await page.waitForTimeout(500);
      
      // Press enter to search
      await searchInput.press('Enter');
      
      // Wait for results
      await page.waitForTimeout(6000);
      
      const screenshotPath = `/Users/ian.bartholomew/Dev/family-assistant/costco-search-${i}.png`;
      await page.screenshot({ path: screenshotPath, fullPage: false });
      console.log(`Screenshot: ${screenshotPath}`);
      
      const pageTitle = await page.title();
      console.log('Title:', pageTitle);
      const currentUrl = page.url();
      console.log('URL:', currentUrl);
      
      // Check for access denied
      const bodyText = await page.evaluate(() => document.body?.innerText?.substring(0, 500) || '');
      if (bodyText.includes('Access Denied')) {
        console.log('ACCESS DENIED - going back to homepage');
        await page.goto('https://www.costco.com/', { waitUntil: 'networkidle', timeout: 45000 });
        await page.waitForTimeout(3000);
        continue;
      }
      
      // Extract product data
      const products = await page.evaluate(() => {
        const results = [];
        // Try multiple selector strategies
        const tiles = document.querySelectorAll('.product-tile-set .product, .product, [class*="product-tile"], .col-xs-6.col-lg-4');
        
        for (let i = 0; i < Math.min(tiles.length, 8); i++) {
          const tile = tiles[i];
          const nameEl = tile.querySelector('.description a, [class*="description"] a, h3 a, .MuiTypography-root a');
          const priceEl = tile.querySelector('.price, [class*="price"]');
          const linkEl = tile.querySelector('a[href*=".product."]') || tile.querySelector('a');
          
          const name = nameEl?.textContent?.trim() || '';
          const price = priceEl?.textContent?.trim() || '';
          const link = linkEl?.href || '';
          
          if (name && price) results.push({ name, price, link });
        }
        
        if (results.length === 0) {
          return { raw: document.body?.innerText?.substring(0, 3000) || 'empty', count: 0 };
        }
        return { products: results, count: results.length };
      });
      
      console.log('Results:', JSON.stringify(products, null, 2));
      
      // Navigate back to homepage for next search
      if (i < items.length - 1) {
        await page.goto('https://www.costco.com/', { waitUntil: 'networkidle', timeout: 45000 });
        await page.waitForTimeout(2000);
      }
      
    } catch (err) {
      console.log(`Error: ${err.message}`);
      // Try to recover by going back to homepage
      try {
        await page.goto('https://www.costco.com/', { waitUntil: 'networkidle', timeout: 45000 });
        await page.waitForTimeout(3000);
      } catch(e) {}
    }
  }
  
  await browser.close();
  console.log('\nDone!');
})();
