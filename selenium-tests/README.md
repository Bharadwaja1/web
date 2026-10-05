# Selenium tests

`tests/login-tests.js` runs 300 data-driven desktop Chrome checks against the real login UI and writes Excel and HTML reports under `FINAL REPORTS`. Start the app first, then run `npm run test:selenium`. Set `BASE_URL`, `HEADLESS=false`, or `SELENIUM_REPORT` to override defaults. Statuses always reflect the actual run.
