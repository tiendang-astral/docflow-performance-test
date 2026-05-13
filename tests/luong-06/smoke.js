/**
 * Luồng 06 — Smoke Test
 * Mục tiêu: xác nhận luồng thiết kế hồ sơ trên canvas hoạt động đúng với tải tối thiểu.
 *
 * Run:
 *   k6 run tests/luong-06/smoke.js
 *   k6 run -e BASE_URL=http://staging:29002/api tests/luong-06/smoke.js
 */

import { SharedArray } from 'k6/data';
import runFlow from '../../flows/luong-06.flow.js';
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
    'http_req_duration{name:login}':                   ['p(95)<800'],
    'http_req_duration{name:csrf}':                    ['p(95)<800'],
    'http_req_duration{name:create_dossier}':          ['p(95)<1200'],
    'http_req_duration{name:list_approved_templates}': ['p(95)<1000'],
    'http_req_duration{name:list_approved_rules}':     ['p(95)<1000'],
    'http_req_duration{name:get_canvas}':              ['p(95)<1200'],
    'http_req_duration{name:save_canvas}':             ['p(95)<1200'],
    'http_req_duration{name:verify_canvas}':           ['p(95)<1200'],
    'http_req_duration{name:delete_dossier}':          ['p(95)<1200'],
  },
};

export default function () {
  runFlow(users);
}

export const handleSummary = buildSummary('luong-06-smoke');
