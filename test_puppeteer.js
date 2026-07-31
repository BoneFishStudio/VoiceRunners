const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();
  
  // Enable download behavior if needed or listen to download events
  const filePath = path.resolve('tools/screenshot-themes.html');
  await page.goto(`file://${filePath}`);
  
  console.log('Page loaded');
  
  // Wait for themes to render or check console/status
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  // Find button
  const button = await page.$('#capture-all-btn');
  if (button) {
    console.log('Found capture button, clicking...');
    await button.click();
    
    // Wait for screenshots / downloads
    await new Promise(resolve => setTimeout(resolve, 5000));
  } else {
    console.log('Button not found');
  }

  await browser.close();
})();
