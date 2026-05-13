/**
 * Endpoint: platform-v3 — Soak Test
 * Mục tiêu: phát hiện memory leak, connection leak khi tải kéo dài.
 *
 * Run:
 *   k6 run tests/endpoints/platform-v3/soak.js
 *   k6 run -e BASE_URL=http://staging:29002/api tests/endpoints/platform-v3/soak.js
 */

import { SharedArray } from 'k6/data';
import runFlow from '../../../endpoints/platform-v3.flow.js';
import { buildSummary } from '../../../lib/report.js';

const users = new SharedArray('users', function () {
  return JSON.parse(open('../../../data/users.json'));
});

export const options = {
  stages: [
    { duration: '5m', target: 20 },
    { duration: '2h', target: 20 },
    { duration: '5m', target: 0  },
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<2000'],
    'http_req_duration{name:v3_upload_init}': ['p(95)<1200'],
    'http_req_duration{name:v3_list_jobs}':   ['p(95)<1000'],
    'http_req_duration{name:v3_get_job}':     ['p(95)<1000'],
  },
};

export default function () {
  runFlow(users);
}

export const handleSummary = buildSummary('platform-v3-soak');
