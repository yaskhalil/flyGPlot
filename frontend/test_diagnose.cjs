const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
    console.log(`BROWSER_LOG [${msg.type()}]: ${msg.text()}`);
  });

  page.on('pageerror', err => {
    consoleErrors.push(err.message);
    console.error(`BROWSER_PAGE_ERROR: ${err.message}`);
  });

  try {
    console.log('Navigating to http://localhost:5174...');
    await page.goto('http://localhost:5174', { waitUntil: 'networkidle' });
    console.log('Page loaded.');

    // Wait a bit for the index to load
    await page.waitForTimeout(2000);

    // Click on Ledger Charts navigation button
    console.log('Clicking 02_LEDGER_CHARTS...');
    await page.click('text=02_LEDGER_CHARTS');

    // Wait for data loading and Plotly rendering
    await page.waitForTimeout(3000);

    console.log('Checking for Plotly components...');
    const plotlyContainer = await page.$('.js-plotly-plot');
    console.log(`Plotly container found: ${!!plotlyContainer}`);

    const screens = await page.$$('.instrument-screen');
    console.log(`Instrument screen elements found: ${screens.length}`);

    // Capture screenshot
    const screenshotPath = '/Users/yaseenkhalil/.gemini/antigravity-cli/brain/2330cbe0-b91b-4426-8041-2f1d8ccefa3f/screenshot.png';
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`Screenshot saved to ${screenshotPath}`);

    if (consoleErrors.length > 0) {
      console.log('--- BROWSER ERRORS DETECTED ---');
      consoleErrors.forEach(err => console.log(err));
    } else {
      console.log('No browser console errors detected.');
    }

  } catch (error) {
    console.error('Test script failed:', error);
  } finally {
    await browser.close();
  }
})();
