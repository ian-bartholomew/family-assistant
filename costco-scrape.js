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

async function scrapeItem(page, item, index) {
  const url = buildUrl(item.query);
  console.log(`\n--- Searching for: ${item.query} ---`);
  console.log(`URL: ${url}`);
  
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    
    // Take screenshot
    const screenshotPath = `/Users/ian.bartholomew/Dev/family-assistant/costco-${index}.png`;
    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log(`Screenshot saved: ${screenshotPath}`);
    
    // Try to extract product info from the page
    const products = await page.evaluate(() => {
      const results = [];
      
      // Costco product tiles - try multiple selectors
      const selectors = [
        '.product-tile',
        '.product',
        '[data-testid="product-tile"]',
        '.col-xs-6.col-lg-4.col-xl-3',
        '.product-list .row > div',
        '.MuiGrid-item',
        '.product-tile-set .product',
        'div[automation-id="productList"] > div',
      ];
      
      let tiles = [];
      for (const sel of selectors) {
        tiles = document.querySelectorAll(sel);
        if (tiles.length > 0) break;
      }
      
      // If no tiles found, try a broader approach
      if (tiles.length === 0) {
        // Look for price patterns in the page
        const allText = document.body.innerText;
        return { raw: allText.substring(0, 5000), tileCount: 0 };
      }
      
      for (let i = 0; i < Math.min(tiles.length, 6); i++) {
        const tile = tiles[i];
        const name = tile.querySelector('.description, .product-title, h3, [data-testid="product-title"]')?.textContent?.trim() || '';
        const price = tile.querySelector('.price, .product-price, [data-testid="product-price"]')?.textContent?.trim() || '';
        const link = tile.querySelector('a')?.href || '';
        results.push({ name, price, link });
      }
      
      return { products: results, tileCount: tiles.length };
    });
    
    console.log(`Results:`, JSON.stringify(products, null, 2));
    return { item, products, url, screenshotPath };
  } catch (err) {
    console.log(`Error: ${err.message}`);
    return { item, error: err.message, url };
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
  });
  
  // Set zip code cookie for Costco
  await context.addCookies([{
    name: 'invCheckPostalCode',
    value: '90210',
    domain: '.costco.com',
    path: '/',
  }]);
  
  const page = await context.newPage();
  
  for (let i = 0; i < items.length; i++) {
    await scrapeItem(page, items[i], i);
  }
  
  await browser.close();
  console.log('\nDone!');
})();
