/**
 * Luồng 01 — Smoke Test
 * Mục tiêu: xác nhận script và môi trường hoạt động đúng với tải tối thiểu.
 *
 * Run:
 *   k6 run tests/luong-01/smoke.js
 *   k6 run -e BASE_URL=http://staging:29002/api tests/luong-01/smoke.js
 */

import { SharedArray } from 'k6/data';
import runFlow from '../../flows/luong-01.flow.js';
import { buildSummary } from '../../lib/report.js';

const users = new SharedArray('users', function () {
  return JSON.parse(open('../../data/users.json'));
});

export const options = {
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
  vus: 1,
  duration: '10s',
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{name:login}': ['p(95)<800'],
    'http_req_duration{name:get_me}': ['p(95)<800'],
    'http_req_duration{name:list_departments}': ['p(95)<1000'],
    'http_req_duration{name:get_department}': ['p(95)<1000'],
    'http_req_duration{name:logout}': ['p(95)<800'],
  },
};

export default function () {
  runFlow(users);
}

export const handleSummary = buildSummary('luong-01-smoke');
