/**
 * Luồng 08 — Spike Test
 * Mục tiêu: kiểm tra hệ thống xử lý được đột biến lưu lượng khi gán file.
 *
 * Run:
 *   k6 run tests/luong-08/spike.js
 *   k6 run -e BASE_URL=http://staging:29002/api tests/luong-08/spike.js
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
    { duration: '30s', target: 5   },
    { duration: '30s', target: 100 },
    { duration: '1m',  target: 100 },
    { duration: '30s', target: 5   },
    { duration: '30s', target: 0   },
  ],
  thresholds: {
    http_req_failed: ['rate<0.10'],
    http_req_duration: ['p(95)<10000'],
  },
};

export default function () {
  runFlow(users);
}

export const handleSummary = buildSummary('luong-08-spike');
