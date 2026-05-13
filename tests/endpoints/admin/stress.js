/**
 * Endpoint: admin — Stress Test
 * Mục tiêu: tìm điểm hệ thống bắt đầu suy giảm khi tải tăng dần.
 *
 * Run:
 *   k6 run tests/endpoints/admin/stress.js
 *   k6 run -e BASE_URL=http://staging:29002/api tests/endpoints/admin/stress.js
 */

import { SharedArray } from 'k6/data';
import runFlow from '../../../endpoints/admin.flow.js';
import { buildSummary } from '../../../lib/report.js';

const users = new SharedArray('users', function () {
  return JSON.parse(open('../../../data/users.json'));
});

export const options = {
  stages: [
    { duration: '2m', target: 20  },
    { duration: '5m', target: 50  },
    { duration: '5m', target: 100 },
    { duration: '5m', target: 200 },
    { duration: '5m', target: 0   },
  ],
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<3000'],
  },
};

export default function () {
  runFlow(users);
}

export const handleSummary = buildSummary('admin-stress');
