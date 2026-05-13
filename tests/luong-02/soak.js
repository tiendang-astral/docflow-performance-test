/**
 * Luồng 02 — Soak Test
 * Mục tiêu: phát hiện rò rỉ bộ nhớ, connection leak hoặc tích tụ hàng đợi
 *           dưới tải liên tục trong thời gian dài.
 *
 * Run:
 *   k6 run tests/luong-02/soak.js
 *   k6 run -e BASE_URL=http://staging:29002/api tests/luong-02/soak.js
 *   k6 run -e QUICK=false tests/luong-02/soak.js   # full 2h10m run
 */

import { SharedArray } from 'k6/data';
import runFlow from '../../flows/luong-02.flow.js';
import { buildSummary } from '../../lib/report.js';
import { stages } from '../../lib/stages.js';

const users = new SharedArray('users', function () {
  return JSON.parse(open('../../data/users.json'));
});

export const options = {
  stages: stages.soak,
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<2000'],
    'http_req_duration{name:list_form_templates}': ['p(95)<1000'],
    'http_req_duration{name:create_form_template}': ['p(95)<1200'],
    'http_req_duration{name:get_form_template}':   ['p(95)<1200'],
  },
};

export default function () {
  runFlow(users);
}

export const handleSummary = buildSummary('luong-02-soak');
