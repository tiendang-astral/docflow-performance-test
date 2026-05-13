/**
 * Endpoint: admin — Load Test
 * Mục tiêu: kiểm tra hành vi ở mức tải thông thường.
 *
 * Run:
 *   k6 run tests/endpoints/admin/load.js
 *   k6 run -e BASE_URL=http://staging:29002/api tests/endpoints/admin/load.js
 */

import { SharedArray } from 'k6/data';
import runFlow from '../../../endpoints/admin.flow.js';
import { buildSummary } from '../../../lib/report.js';

const users = new SharedArray('users', function () {
  return JSON.parse(open('../../../data/users.json'));
});

export const options = {
  stages: [
    { duration: '2m',  target: 20 },
    { duration: '15m', target: 20 },
    { duration: '3m',  target: 0  },
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<2000'],
    'http_req_duration{name:login}':            ['p(95)<800'],
    'http_req_duration{name:admin_overview}':   ['p(95)<2000'],
    'http_req_duration{name:admin_extraction}': ['p(95)<2000'],
    'http_req_duration{name:admin_validation}': ['p(95)<2000'],
    'http_req_duration{name:admin_dossiers}':   ['p(95)<2000'],
    'http_req_duration{name:admin_pipeline}':   ['p(95)<2000'],
    'http_req_duration{name:admin_approval}':   ['p(95)<2000'],
    'http_req_duration{name:admin_activity}':   ['p(95)<2000'],
  },
};

export default function () {
  runFlow(users);
}

export const handleSummary = buildSummary('admin-load');
