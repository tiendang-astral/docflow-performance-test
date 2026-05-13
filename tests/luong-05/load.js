/**
 * Luồng 05 — Load Test
 * Mục tiêu: kiểm tra luồng tạo hồ sơ và mở canvas ở mức tải thông thường.
 *
 * Run:
 *   k6 run tests/luong-05/load.js
 *   k6 run -e BASE_URL=http://staging:29002/api tests/luong-05/load.js
 */

import { SharedArray } from 'k6/data';
import runFlow from '../../flows/luong-05.flow.js';
import { buildSummary } from '../../lib/report.js';

const users = new SharedArray('users', function () {
  return JSON.parse(open('../../data/users.json'));
});

export const options = {
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
  stages: [
    { duration: '2m',  target: 20 },
    { duration: '15m', target: 20 },
    { duration: '3m',  target: 0  },
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1000'],
    'http_req_duration{name:login}':          ['p(95)<800'],
    'http_req_duration{name:list_dossiers}':  ['p(95)<1000'],
    'http_req_duration{name:create_dossier}': ['p(95)<1200'],
    'http_req_duration{name:get_canvas}':     ['p(95)<1200'],
    'http_req_duration{name:save_canvas}':    ['p(95)<1200'],
  },
};

export default function () {
  runFlow(users);
}

export const handleSummary = buildSummary('luong-05-load');
