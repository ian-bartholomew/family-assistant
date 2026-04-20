const { chromium } = require('playwright');

const items = [
  { name: 'butter', query: 'organic+butter' },
  { name: 'Fresh blueberries', query: 'organic+blueberries' },
  { name: 'English muffins', query: 'english+muffins' },
];

const BASE = '/Users/ian.bartholomew/Dev/family-assistant';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: 1440, height: 900 },
  });

  for (const item of items) {
    const page = await context.newPage();
    const url = `https://www.amazon.com/s?k=${item.query}&i=amazonfresh`;
    console.log(`\n=== Searching for: ${item.name} ===`);
    
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(5000);
      
      const slug = item.name.toLowerCase().replace(/\s+/g, '-');
      const screenshotPath = `${BASE}/af-${slug}.png`;
      await page.screenshot({ path: screenshotPath, fullPage: false });
      console.log(`Screenshot saved: ${screenshotPath}`);
      
      const products = await page.evaluate(() => {
        const results = [];
        const cards = document.querySelectorAll('[data-component-type="s-search-result"]');
        cards.forEach((card, i) => {
          if (i >= 5) return;
          const titleEl = card.querySelector('h2 a span') || card.querySelector('.a-text-normal');
          const priceWhole = card.querySelector('.a-price .a-price-whole');
          const priceFraction = card.querySelector('.a-price .a-price-fraction');
          const linkEl = card.querySelector('h2 a');
          const title = titleEl ? titleEl.textContent.trim() : '';
          let price = null;
          if (priceWhole) {
            const whole = priceWhole.textContent.replace('.', '').trim();
            const frac = priceFraction ? priceFraction.textContent.trim() : '00';
            price = parseFloat(`${whole}.${frac}`);
          }
          const href = linkEl ? linkEl.getAttribute('href') : '';
          const fullUrl = href ? `https://www.amazon.com${href}` : '';
          results.push({ title, price, url: fullUrl });
        });
        return results;
      });
      
      console.log(`Found ${products.length} products:`);
      products.forEach((p, i) => {
        console.log(`  ${i+1}. ${p.title} - $${p.price} - ${p.url.substring(0, 100)}...`);
      });
      
    } catch (err) {
      console.log(`Error: ${err.message}`);
    }
    
    await page.close();
  }
  
  await browser.close();
})();
