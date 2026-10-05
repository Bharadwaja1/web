const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const path = require('path');
const { makeCases } = require('../../test-support/e2e-cases');
const { writeTestReport } = require('../../test-support/excel-report');

const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:4173';
const report = path.resolve(process.env.SELENIUM_REPORT || 'FINAL REPORTS/Selenium_Test_Report.xlsx');

async function main() {
  const rows = makeCases('SEL');
  const options = new chrome.Options();
  if (process.env.HEADLESS !== 'false') options.addArguments('--headless=new', '--no-sandbox', '--disable-dev-shm-usage');
  options.addArguments('--window-size=1440,1000');
  let driver;
  try { driver = await new Builder().forBrowser('chrome').setChromeOptions(options).build(); }
  catch (error) {
    rows.forEach(test => { test.status = 'Error'; test.actual = 'Browser session could not start.'; test.error = error.message; test.durationMs = 0; });
    await writeTestReport(report, 'Selenium Web E2E', rows, { Base_URL: baseUrl, Browser: 'Chrome', Catalogued_cases: 300 });
    throw error;
  }
  const adapter = {
    click: async selector => (await driver.findElement(By.css(selector))).click(),
    fill: async (selector, value) => { const el = await driver.findElement(By.css(selector)); await el.clear(); await el.sendKeys(value); },
    text: async selector => (await driver.findElement(By.css(selector))).getText(),
    attr: async (selector, name) => (await driver.findElement(By.css(selector))).getAttribute(name),
    visible: async selector => (await driver.findElement(By.css(selector))).isDisplayed(),
    valid: async selector => driver.executeScript('return arguments[0].checkValidity()', await driver.findElement(By.css(selector))),
    eval: expression => driver.executeScript(`return (${expression})`)
  };
  try {
    for (const test of rows) {
      const started = Date.now();
      try {
        await driver.get(baseUrl);
        await driver.wait(until.elementLocated(By.css('#loginForm')), 10000);
        const ok = await test.run(adapter);
        test.status = ok ? 'Passed' : 'Failed';
        test.actual = ok ? 'Expected condition was satisfied.' : 'Expected condition was not satisfied.';
      } catch (error) {
        test.status = 'Error'; test.actual = 'Test could not complete.'; test.error = error.message;
      }
      test.durationMs = Date.now() - started;
    }
  } finally {
    await driver.quit();
    await writeTestReport(report, 'Selenium Web E2E', rows, { Base_URL: baseUrl, Browser: 'Chrome', Catalogued_cases: 300 });
  }
  const failures = rows.filter(row => !['Passed', 'Skipped'].includes(row.status));
  console.log(`Selenium: ${rows.length - failures.length}/${rows.length} passed; report: ${report}`);
  if (failures.length) process.exitCode = 1;
}

main().catch(error => { console.error(error); process.exitCode = 1; });
