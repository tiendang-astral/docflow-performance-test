/**
 * Endpoints — AI Draft Generation — Smoke Test
 * Mục tiêu: xác nhận script và môi trường hoạt động đúng với tải tối thiểu.
 *
 * Run:
 *   k6 run tests/endpoints/ai/smoke.js
 *   k6 run -e BASE_URL=http://staging:29002/api tests/endpoints/ai/smoke.js
 */

import { SharedArray } from 'k6/data';
import runFlow from '../../../endpoints/ai.flow.js';
import { buildSummary } from '../../../lib/report.js';

const users = new SharedArray('users', function () {
  return JSON.parse(open('../../../data/users.json'));
});

export const options = {
  vus: 1,
  duration: '10s',
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{name:login}':            ['p(95)<800'],
    'http_req_duration{name:csrf}':             ['p(95)<800'],
    'http_req_duration{name:ai_template_draft}': ['p(95)<10000'],
    'http_req_duration{name:ai_rule_draft}':    ['p(95)<10000'],
  },
};

export default function () {
  runFlow(users);
}

export const handleSummary = buildSummary('ai-smoke');
