import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 100,
  duration: '1m',
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['avg<500', 'p(95)<1000'],
    checks: ['rate>0.99']
  }
};

const baseUrl = __ENV.BASE_URL || 'http://127.0.0.1:4173';

export default function () {
  const response = http.get(`${baseUrl}/api/health`, { tags: { endpoint: 'GET /api/health' } });
  check(response, {
    'health returns 200': r => r.status === 200,
    'health returns JSON': r => String(r.headers['Content-Type']).includes('application/json'),
    'health body reports ok': r => r.json('ok') === true
  });
  sleep(0.05);
}

export function handleSummary(data) {
  return { [__ENV.K6_SUMMARY || 'test-results/k6-summary.json']: JSON.stringify(data, null, 2) };
}
