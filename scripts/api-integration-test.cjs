const assert = require('node:assert/strict');
const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:4173';

async function request(path, options) {
  return fetch(baseUrl + path, { ...options, signal: AbortSignal.timeout(10000) });
}
async function main() {
  const health = await request('/api/health');
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { ok: true });
  assert.equal(health.headers.get('x-content-type-options'), 'nosniff');
  assert.match(health.headers.get('content-security-policy') || '', /default-src 'self'/);
  const home = await request('/');
  assert.equal(home.status, 200);
  assert.match(await home.text(), /<title>Mood Tunes<\/title>/);
  const missing = await request('/api/does-not-exist');
  assert.equal(missing.status, 404);
  const traversal = await request('/..%2f..%2fetc%2fpasswd');
  assert.ok([400, 403, 404].includes(traversal.status));
  console.log('API integration checks passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
