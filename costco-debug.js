const { chromium } = require('playwright');

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
  
  await page.goto('https://www.costco.com/', { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForTimeout(5000);
  
  await page.screenshot({ path: '/Users/ian.bartholomew/Dev/family-assistant/costco-debug-home.png', fullPage: false });
  
  // Find all input elements
  const inputs = await page.evaluate(() => {
    const allInputs = document.querySelectorAll('input, [role="search"], [role="searchbox"]');
    return Array.from(allInputs).map(el => ({
      tag: el.tagName,
      id: el.id,
      name: el.name,
      type: el.type,
      placeholder: el.placeholder,
      className: el.className?.substring?.(0, 100) || '',
      ariaLabel: el.getAttribute('aria-label'),
    }));
  });
  console.log('Inputs found:', JSON.stringify(inputs, null, 2));
  
  // Also get page HTML for the header area
  const headerHtml = await page.evaluate(() => {
    const header = document.querySelector('header, #header, [class*="header"]');
    return header?.innerHTML?.substring(0, 3000) || 'no header found';
  });
  console.log('\nHeader HTML (first 2000):', headerHtml.substring(0, 2000));
  
  await browser.close();
})();
