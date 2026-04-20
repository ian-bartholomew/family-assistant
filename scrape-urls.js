const { chromium } = require('playwright');

const items = [
  { name: 'butter', query: 'organic+butter', pick: 0 },
  { name: 'strawberries', query: 'organic+strawberries', pick: 1 },
  { name: 'blueberries', query: 'organic+blueberries', pick: 0 },
  { name: 'eggs', query: '2+dozen+eggs', pick: 0 },
  { name: 'muffins', query: 'english+muffins', pick: 0 },
];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: 1440, height: 900 },
  });

  for (const item of items) {
    const page = await context.newPage();
    const url = `https://www.amazon.com/s?k=${item.query}&i=amazonfresh`;
    
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(4000);
      
      const products = await page.evaluate((pickIdx) => {
        const results = [];
        const cards = document.querySelectorAll('[data-component-type="s-search-result"]');
        cards.forEach((card, i) => {
          if (i > pickIdx) return;
          const titleEl = card.querySelector('h2 a span') || card.querySelector('.a-text-normal');
          const priceWhole = card.querySelector('.a-price .a-price-whole');
          const priceFraction = card.querySelector('.a-price .a-price-fraction');
          const linkEl = card.querySelector('h2 a');
          const asin = card.getAttribute('data-asin');
          const title = titleEl ? titleEl.textContent.trim() : '';
          let price = null;
          if (priceWhole) {
            const whole = priceWhole.textContent.replace('.', '').trim();
            const frac = priceFraction ? priceFraction.textContent.trim() : '00';
            price = parseFloat(`${whole}.${frac}`);
          }
          const href = linkEl ? linkEl.getAttribute('href') : '';
          results.push({ title, price, href, asin });
        });
        return results;
      }, item.pick);
      
      const picked = products[item.pick] || products[0];
      const productUrl = picked.asin ? `https://www.amazon.com/dp/${picked.asin}` : `https://www.amazon.com${picked.href}`;
      console.log(`${item.name}|${picked.title}|${picked.price}|${productUrl}`);
      
    } catch (err) {
      console.log(`${item.name}|ERROR|0|${err.message}`);
    }
    
    await page.close();
  }
  
  await browser.close();
})();
