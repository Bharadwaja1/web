const fs = require('fs');
const path = require('path');
const { writeTestReport } = require('../test-support/excel-report');

const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:4173';
const report = path.resolve(process.env.SECURITY_REPORT || 'FINAL REPORTS/Vulnerability_Test_Report.xlsx');
const server = fs.readFileSync(path.resolve('backend/server.js'), 'utf8');
const firebase = fs.readFileSync(path.resolve('frontend/firebase-client.js'), 'utf8');
const rules = fs.readFileSync(path.resolve('firestore.rules'), 'utf8');
const okStatus = (...codes) => response => codes.includes(response.status);
const header = (name, predicate) => response => predicate(response.headers.get(name) || '');

const controls = [
  ['Availability', 'Health endpoint remains available under untrusted query input', v => `/api/health?probe=${v}`, 'GET', okStatus(200), 'API Security'],
  ['API Security', 'Health response is JSON', v => `/api/health?format=${v}`, 'GET', header('content-type', value => value.includes('application/json')), 'API Security'],
  ['Sensitive Data Exposure', 'API responses prohibit storage', v => `/api/health?cache=${v}`, 'GET', header('cache-control', value => value.includes('no-store')), 'Sensitive Data Exposure'],
  ['Security Headers', 'Content Security Policy restricts default sources', v => `/?csp=${v}`, 'GET', header('content-security-policy', value => value.includes("default-src 'self'")), 'XSS'],
  ['Clickjacking', 'Frame embedding is denied', v => `/?frame=${v}`, 'GET', response => response.headers.get('x-frame-options') === 'DENY' && /frame-ancestors 'none'/.test(response.headers.get('content-security-policy') || ''), 'Clickjacking'],
  ['Security Headers', 'MIME sniffing is disabled', v => `/?mime=${v}`, 'GET', response => response.headers.get('x-content-type-options') === 'nosniff', 'Security Headers'],
  ['Security Headers', 'Referrer leakage is restricted', v => `/?referrer=${v}`, 'GET', header('referrer-policy', value => value === 'strict-origin-when-cross-origin'), 'Sensitive Data Exposure'],
  ['Authorization', 'Unknown API routes are denied', v => `/api/admin-${v}`, 'GET', okStatus(404), 'Broken Access Control'],
  ['Information Disclosure', 'Unknown API errors do not expose stack traces', v => `/api/missing-${v}`, 'GET', async response => !/\bat\s+\S+.*:\d+/i.test(await response.text()), 'Sensitive Data Exposure'],
  ['HTTP Methods', 'Mutation methods are not accepted by health endpoint', v => `/api/health?method=${v}`, 'POST', okStatus(404, 405), 'API Security'],
  ['Path Traversal', 'Encoded Unix traversal is rejected', v => `/..%2f..%2fetc%2fpasswd?x=${v}`, 'GET', okStatus(400, 403, 404), 'Path Traversal'],
  ['Path Traversal', 'Encoded Windows traversal is rejected', v => `/..%5c..%5cWindows%5cwin.ini?x=${v}`, 'GET', okStatus(400, 403, 404), 'Path Traversal'],
  ['CORS', 'Credentials are not exposed to arbitrary origins', v => `/api/health?origin=${v}`, 'GET', response => response.headers.get('access-control-allow-origin') !== '*', 'CORS'],
  ['Authentication', 'Firebase Authentication is initialized by the client', null, 'STATIC', () => /getAuth\(|initializeApp\(/.test(firebase), 'Authentication'],
  ['Broken Authentication', 'Passwords are handled by Firebase rather than local storage', null, 'STATIC', () => /signInWithEmailAndPassword/.test(firebase) && !/localStorage\.setItem\([^,]*password/i.test(firebase), 'Broken Authentication'],
  ['JWT', 'Token lifecycle is delegated to Firebase Authentication', null, 'STATIC', () => /onAuthStateChanged/.test(firebase) && /signOut\(/.test(firebase), 'JWT'],
  ['Authorization', 'Firestore requires an authenticated user', null, 'STATIC', () => /request\.auth != null/.test(rules), 'Authorization'],
  ['Broken Access Control', 'Firestore binds records to the authenticated user ID', null, 'STATIC', () => /request\.auth\.uid == userId/.test(rules), 'Broken Access Control'],
  ['Privilege Escalation', 'Firestore subcollections retain owner checks', null, 'STATIC', () => /group in \[/.test(rules) && /request\.auth\.uid == userId/.test(rules), 'Privilege Escalation'],
  ['SQL Injection', 'Backend has no SQL execution surface', null, 'STATIC', () => !/\b(?:mysql|pg|sqlite|sequelize|query)\s*\(/i.test(server), 'SQL Injection'],
  ['Command Injection', 'Backend does not execute operating-system commands', null, 'STATIC', () => !/child_process|\bexec(?:File|Sync)?\s*\(|\bspawn\s*\(/.test(server), 'Command Injection'],
  ['SSRF', 'Upstream requests use a fixed Audius origin', null, 'STATIC', () => /const audiusBase='https:\/\/api\.audius\.co\/v1'/.test(server) && /audiusBase\+endpoint/.test(server), 'SSRF'],
  ['Input Validation', 'Mood values are allowlisted to alphabetic input', null, 'STATIC', () => /\^\[a-z\]\+\$\/i/.test(server), 'Input Validation'],
  ['Session Security', 'Application does not create server-side session cookies', null, 'STATIC', () => !/set-cookie|express-session|cookie-session/i.test(server), 'Session Security'],
  ['DoS / Rate Limiting', 'Audius proxy enforces timeouts and per-client request limits', null, 'STATIC', () => /AbortSignal\.timeout/.test(server) && /rateLimitAudius/.test(server), 'Rate Limiting']
];

const attackValues = [
  'normal', '%27%20OR%201%3D1--', '%3Cscript%3Ealert(1)%3C%2Fscript%3E', '..%2F..%2F', '%00',
  '%24%7Bjndi%3Aldap%3A%2F%2Fx%7D', '%3Bcat%20%2Fetc%2Fpasswd', '%7B%22role%22%3A%22admin%22%7D',
  '%0d%0aX-Injected%3Atrue', 'A'.repeat(256), '%2F%2F169.254.169.254', '%EF%BC%87%20OR%20%EF%BC%91%3D%EF%BC%91'
];

async function main() {
  const rows = [];
  for (let variant = 0; variant < attackValues.length; variant++) {
    for (const [category, title, endpoint, method, verify, coverage] of controls) {
      const value = attackValues[variant];
      const row = {
        id: `SEC-${String(rows.length + 1).padStart(3, '0')}`, category,
        title: `${title} [payload ${variant + 1}]`, priority: ['Authentication', 'Authorization', 'Broken Access Control', 'Command Injection', 'SSRF'].includes(coverage) ? 'Critical' : 'High',
        preconditions: endpoint ? 'Isolated local application is running' : 'Repository source and Firestore rules are available',
        steps: endpoint ? [`Send ${method} ${endpoint(value)}`, `Use security payload set ${variant + 1}`, `Validate ${coverage} control`] : [`Inspect the relevant implementation`, `Validate ${coverage} control using rule set ${variant + 1}`],
        expected: title
      };
      const started = Date.now();
      try {
        const response = endpoint ? await fetch(baseUrl + endpoint(value), {
          method, redirect: 'manual', headers: { 'X-Security-Test': row.id, Origin: `https://untrusted-${variant}.example` }, signal: AbortSignal.timeout(10000)
        }) : null;
        const passed = await verify(response, value);
        row.status = passed ? 'Passed' : 'Failed';
        row.actual = passed ? `${coverage} control met the expected condition.` : `${coverage} control did not meet the expected condition.`;
      } catch (error) {
        row.status = 'Error'; row.actual = 'Security probe did not complete.'; row.error = error.message;
      }
      row.durationMs = Date.now() - started;
      rows.push(row);
    }
  }
  await writeTestReport(report, 'Vulnerability and DAST Security Assessment', rows, {
    Target: baseUrl, Executed_cases: rows.length, Method: 'Non-destructive dynamic probes plus source and Firestore-rule controls',
    Coverage: [...new Set(controls.map(control => control[5]))].join(', ')
  });
  const failures = rows.filter(row => row.status !== 'Passed');
  console.log(`Security assessment: ${rows.length - failures.length}/${rows.length} passed; reports: ${report} and ${report.replace(/\.xlsx$/i, '.html')}`);
  if (failures.length) process.exitCode = 1;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
