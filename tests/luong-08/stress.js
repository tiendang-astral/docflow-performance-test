/**
 * Luồng 08 — Stress Test
 * Mục tiêu: tìm giới hạn tải của luồng gán file cho biểu mẫu.
 *
 * Run:
 *   k6 run tests/luong-08/stress.js
 *   k6 run -e BASE_URL=http://staging:29002/api tests/luong-08/stress.js
 */

import { SharedArray } from 'k6/data';
import runFlow from '../../flows/luong-08.flow.js';
import { buildSummary } from '../../lib/report.js';

const users = new SharedArray('users', function () {
  return JSON.parse(open('../../data/users.json'));
});

export const options = {
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
  stages: [
    { duration: '2m', target: 20  },
    { duration: '5m', target: 50  },
    { duration: '5m', target: 100 },
    { duration: '5m', target: 200 },
    { duration: '5m', target: 0   },
  ],
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<5000'],
  },
};

export default function () {
  runFlow(users);
}

export const handleSummary = buildSummary('luong-08-stress');
