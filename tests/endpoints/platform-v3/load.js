/**
 * Endpoint: platform-v3 — Load Test
 * Mục tiêu: kiểm tra hành vi ở mức tải thông thường.
 *
 * Run:
 *   k6 run tests/endpoints/platform-v3/load.js
 *   k6 run -e BASE_URL=http://staging:29002/api tests/endpoints/platform-v3/load.js
 */

import { SharedArray } from 'k6/data';
import runFlow from '../../../endpoints/platform-v3.flow.js';
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
    http_req_duration: ['p(95)<1000'],
    'http_req_duration{name:login}':          ['p(95)<800'],
    'http_req_duration{name:create_dossier}': ['p(95)<1200'],
    'http_req_duration{name:v3_upload_init}': ['p(95)<1200'],
    'http_req_duration{name:v3_list_jobs}':   ['p(95)<1000'],
    'http_req_duration{name:v3_get_job}':     ['p(95)<1000'],
    'http_req_duration{name:delete_dossier}': ['p(95)<1200'],
  },
};

export default function () {
  runFlow(users);
}

export const handleSummary = buildSummary('platform-v3-load');
