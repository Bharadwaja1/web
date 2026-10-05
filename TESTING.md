# Automated test suites

The project has four CI suites and a single combined downloadable artifact named `FINAL_REPORTS`.

| Suite | Command | Scope | Excel output |
|---|---|---|---|
| Selenium | `npm run test:selenium` | 300 desktop login/UI E2E cases | `FINAL REPORTS/Selenium_Test_Report.xlsx` and `.html` |
| Appium | `npm run test:appium` | 300 Android Chrome/PWA E2E cases | `FINAL REPORTS/Appium_Test_Report.xlsx` and `.html` |
| k6 | `k6 run load-tests/baseline.js` then `npm run test:load:report` | 100 concurrent users for 1 minute | `FINAL REPORTS/Load_Test_Report.xlsx` and `.html` |
| Security | `npm run test:security` | 300 safe static/dynamic backend controls | `FINAL REPORTS/Vulnerability_Test_Report.xlsx` and `.html` |

Run `npm ci` once. Selenium requires Chrome and a compatible driver. Appium requires an Android emulator, Appium server, UiAutomator2, and Chrome. All web/security/load runs require `npm start` in another terminal. CI behavior is defined in `.github/workflows/enterprise-ci-cd.yml`.

Each E2E/security workbook contains `Summary` and `Test Details` worksheets. Statuses reflect actual execution; a case is never marked passed merely because it exists in the catalogue. The load workbook records RPS, total requests, average/minimum/maximum/p95 response time, failures, and checks.

Reports are generated only by real executions. The workflow validates all eight expected files before it creates `FINAL_REPORTS.zip`.
