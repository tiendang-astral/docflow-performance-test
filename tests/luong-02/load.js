/**
 * Luồng 02 — Load Test
 * Mục tiêu: kiểm tra hành vi hệ thống ở tải bình thường (20 VUs).
 *
 * Run:
 *   k6 run tests/luong-02/load.js
 *   k6 run -e BASE_URL=http://staging:29002/api tests/luong-02/load.js
 *   k6 run -e QUICK=false tests/luong-02/load.js   # full 20-min run
 */

import { SharedArray } from 'k6/data';
import runFlow from '../../flows/luong-02.flow.js';
import { buildSummary } from '../../lib/report.js';
import { stages } from '../../lib/stages.js';

const users = new SharedArray('users', function () {
  return JSON.parse(open('../../data/users.json'));
});

export const options = {
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
  stages: stages.load,
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1000'],
    'http_req_duration{name:login}':               ['p(95)<800'],
    'http_req_duration{name:list_form_templates}': ['p(95)<1000'],
    'http_req_duration{name:create_form_template}': ['p(95)<1200'],
    'http_req_duration{name:get_form_template}':   ['p(95)<1200'],
    'http_req_duration{name:update_form_template}': ['p(95)<1200'],
    'http_req_duration{name:delete_form_template}': ['p(95)<1200'],
  },
};

export default function () {
  runFlow(users);
}

export const handleSummary = buildSummary('luong-02-load');
