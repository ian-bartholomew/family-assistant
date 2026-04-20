const { chromium } = require('playwright');

const items = [
  { query: 'organic butter', original: 'butter' },
  { query: 'organic strawberries', original: 'Organic strawberries' },
  { query: 'organic fresh blueberries', original: 'Fresh blueberries' },
  { query: 'organic eggs 2 dozen', original: '2 dozen eggs' },
  { query: 'english muffins', original: 'English muffins' },
];

function buildUrl(query) {
  return `https://www.costco.com/CatalogSearch?dept=All&keyword=${encodeURIComponent(query)}`;
}

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
  
  // Remove webdriver flag
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });
  
  // Visit homepage first
  console.log('Visiting Costco homepage...');
  try {
    await page.goto('https://www.costco.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000);
    await page.screenshot({ path: '/Users/ian.bartholomew/Dev/family-assistant/costco-home2.png' });
    console.log('Homepage loaded');
    
    const title = await page.title();
    console.log('Title:', title);
  } catch(e) {
    console.log('Homepage error:', e.message);
  }

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const url = buildUrl(item.query);
    console.log(`\n--- Searching for: ${item.query} ---`);
    
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(5000);
      
      const screenshotPath = `/Users/ian.bartholomew/Dev/family-assistant/costco-item-${i}.png`;
      await page.screenshot({ path: screenshotPath, fullPage: false });
      console.log(`Screenshot: ${screenshotPath}`);
      
      const title = await page.title();
      console.log('Page title:', title);
      
      // Try to get product data
      const products = await page.evaluate(() => {
        const results = [];
        // Try various Costco selectors
        const tiles = document.querySelectorAll('.product-tile-set .product, .product-list .product, [class*="ProductCard"], [class*="product-tile"]');
        
        for (let i = 0; i < Math.min(tiles.length, 5); i++) {
          const tile = tiles[i];
          const name = tile.querySelector('.description a, [class*="description"] a, h3 a')?.textContent?.trim() || '';
          const price = tile.querySelector('.price, [class*="price"]')?.textContent?.trim() || '';
          const link = tile.querySelector('a')?.href || '';
          if (name || price) results.push({ name, price, link });
        }
        
        if (results.length === 0) {
          // Fallback: grab body text
          return { raw: document.body?.innerText?.substring(0, 4000) || 'empty', count: 0 };
        }
        return { products: results, count: results.length };
      });
      
      console.log('Products:', JSON.stringify(products, null, 2));
      
    } catch (err) {
      console.log(`Error: ${err.message}`);
    }
  }
  
  await browser.close();
  console.log('\nDone!');
})();
