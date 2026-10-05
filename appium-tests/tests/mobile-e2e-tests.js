const { remote } = require('webdriverio');
const path = require('path');
const { makeCases } = require('../../test-support/e2e-cases');
const { writeTestReport } = require('../../test-support/excel-report');

const baseUrl = process.env.BASE_URL || 'http://10.0.2.2:4173';
const report = path.resolve(process.env.APPIUM_REPORT || 'FINAL REPORTS/Appium_Test_Report.xlsx');

async function main() {
  const rows = makeCases('APP', true);
  let browser;
  try { browser = await remote({
    hostname: process.env.APPIUM_HOST || '127.0.0.1', port: Number(process.env.APPIUM_PORT || 4723), path: '/',
    capabilities: {
      platformName: 'Android', 'appium:automationName': 'UiAutomator2',
      'appium:deviceName': process.env.ANDROID_DEVICE || 'Android Emulator',
      'appium:browserName': 'Chrome', 'appium:noReset': true,
      'appium:chromedriverAutodownload': true,
      'appium:newCommandTimeout': 180
    }, logLevel: process.env.WDIO_LOG_LEVEL || 'warn'
  }); } catch (error) {
    rows.forEach(test => { test.status = 'Error'; test.actual = 'Appium session could not start.'; test.error = error.message; test.durationMs = 0; });
    await writeTestReport(report, 'Appium Android Mobile-web E2E', rows, { Base_URL: baseUrl, Platform: 'Android Chrome', Catalogued_cases: 300 });
    throw error;
  }
  const element = selector => browser.$(selector);
  const adapter = {
    click: async selector => (await element(selector)).click(),
    fill: async (selector, value) => (await element(selector)).setValue(value),
    text: async selector => (await element(selector)).getText(),
    attr: async (selector, name) => (await element(selector)).getAttribute(name),
    visible: async selector => (await element(selector)).isDisplayed(),
    valid: selector => browser.execute((s) => document.querySelector(s).checkValidity(), selector),
    eval: expression => browser.execute(code => Function(`return (${code})`)(), expression)
  };
  try {
    for (const test of rows) {
      const started = Date.now();
      try {
        await browser.url(baseUrl);
        await (await element('#loginForm')).waitForExist({ timeout: 15000 });
        const ok = await test.run(adapter);
        test.status = ok ? 'Passed' : 'Failed';
        test.actual = ok ? 'Expected mobile condition was satisfied.' : 'Expected mobile condition was not satisfied.';
      } catch (error) {
        test.status = 'Error'; test.actual = 'Mobile test could not complete.'; test.error = error.message;
      }
      test.durationMs = Date.now() - started;
    }
  } finally {
    await browser.deleteSession();
    await writeTestReport(report, 'Appium Android Mobile-web E2E', rows, { Base_URL: baseUrl, Platform: 'Android Chrome', Catalogued_cases: 300 });
  }
  const failures = rows.filter(row => !['Passed', 'Skipped'].includes(row.status));
  console.log(`Appium: ${rows.length - failures.length}/${rows.length} passed; report: ${report}`);
  if (failures.length) process.exitCode = 1;
}

main().catch(error => { console.error(error); process.exitCode = 1; });
