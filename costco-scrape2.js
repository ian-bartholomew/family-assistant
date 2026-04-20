const { firefox } = require('playwright');

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
  const browser = await firefox.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0',
    viewport: { width: 1280, height: 900 },
    extraHTTPHeaders: {
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
    },
  });

  const page = await context.newPage();
  
  // First visit homepage
  console.log('Visiting Costco homepage first...');
  try {
    await page.goto('https://www.costco.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: '/Users/ian.bartholomew/Dev/family-assistant/costco-home.png' });
    console.log('Homepage loaded, screenshot saved');
  } catch(e) {
    console.log('Homepage error:', e.message);
  }

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const url = buildUrl(item.query);
    console.log(`\n--- Searching for: ${item.query} ---`);
    
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(4000);
      
      const screenshotPath = `/Users/ian.bartholomew/Dev/family-assistant/costco-item-${i}.png`;
      await page.screenshot({ path: screenshotPath, fullPage: false });
      console.log(`Screenshot: ${screenshotPath}`);
      
      // Extract text content
      const bodyText = await page.evaluate(() => document.body?.innerText?.substring(0, 3000) || 'empty');
      console.log('Page text (first 1500 chars):', bodyText.substring(0, 1500));
      
    } catch (err) {
      console.log(`Error: ${err.message}`);
    }
  }
  
  await browser.close();
  console.log('\nDone!');
})();
