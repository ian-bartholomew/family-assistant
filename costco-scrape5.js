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
    args: ['--disable-http2', '--no-sandbox', '--disable-blink-features=AutomationControlled']
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
    console.log(`\n=== Searching for: ${item.query} (item ${i+1}/5) ===`);
    
    try {
      // Use the search box with aria-label
      const searchInput = await page.$('input[aria-label="Search Costco"]');
      if (!searchInput) {
        console.log('Search box not found!');
        await page.screenshot({ path: `/Users/ian.bartholomew/Dev/family-assistant/costco-noinput-${i}.png` });
        continue;
      }
      
      await searchInput.click({ clickCount: 3 });
      await page.waitForTimeout(300);
      await searchInput.fill('');
      await page.waitForTimeout(200);
      await searchInput.type(item.query, { delay: 50 });
      await page.waitForTimeout(500);
      await searchInput.press('Enter');
      
      // Wait for navigation and content
      try {
        await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 });
      } catch(e) {}
      await page.waitForTimeout(5000);
      
      const currentUrl = page.url();
      console.log('Current URL:', currentUrl);
      
      // Check for access denied
      const pageText = await page.evaluate(() => document.body?.innerText?.substring(0, 500) || '');
      if (pageText.includes('Access Denied')) {
        console.log('ACCESS DENIED on search results');
        await page.screenshot({ path: `/Users/ian.bartholomew/Dev/family-assistant/costco-denied-${i}.png` });
        // Go back
        await page.goto('https://www.costco.com/', { waitUntil: 'networkidle', timeout: 45000 });
        await page.waitForTimeout(3000);
        continue;
      }
      
      await page.screenshot({ path: `/Users/ian.bartholomew/Dev/family-assistant/costco-search-${i}.png`, fullPage: false });
      console.log(`Screenshot saved: costco-search-${i}.png`);
      
      // Extract products
      const data = await page.evaluate(() => {
        const results = [];
        // Costco uses MUI-based product cards now
        // Look for product descriptions and prices
        const allLinks = document.querySelectorAll('a[href*=".product."]');
        const seen = new Set();
        
        for (const link of allLinks) {
          const href = link.href;
          if (seen.has(href)) continue;
          seen.add(href);
          
          // Go up to find the product card container
          let container = link.closest('[class*="MuiGrid"], [class*="product"], [data-testid*="product"]') || link.parentElement?.parentElement?.parentElement;
          if (!container) continue;
          
          const name = link.textContent?.trim() || '';
          // Find price nearby
          const priceEl = container.querySelector('[class*="price"], [data-testid*="price"]');
          let price = priceEl?.textContent?.trim() || '';
          
          if (!price) {
            // Try finding price in sibling/nearby elements
            const allText = container.textContent || '';
            const priceMatch = allText.match(/\$[\d,.]+/);
            if (priceMatch) price = priceMatch[0];
          }
          
          if (name) results.push({ name: name.substring(0, 200), price, link: href });
        }
        
        if (results.length === 0) {
          // Fallback: look for any price patterns
          const text = document.body?.innerText || '';
          const priceMatches = [...text.matchAll(/\$[\d,.]+/g)].slice(0, 10).map(m => m[0]);
          return { 
            raw: text.substring(0, 4000), 
            prices: priceMatches,
            count: 0 
          };
        }
        return { products: results, count: results.length };
      });
      
      console.log('Data:', JSON.stringify(data, null, 2));
      
      // Go back to homepage for next search
      if (i < items.length - 1) {
        await page.goto('https://www.costco.com/', { waitUntil: 'networkidle', timeout: 45000 });
        await page.waitForTimeout(2000);
      }
      
    } catch (err) {
      console.log(`Error: ${err.message}`);
      try {
        await page.goto('https://www.costco.com/', { waitUntil: 'networkidle', timeout: 45000 });
        await page.waitForTimeout(3000);
      } catch(e) {}
    }
  }
  
  await browser.close();
  console.log('\nDone!');
})();
