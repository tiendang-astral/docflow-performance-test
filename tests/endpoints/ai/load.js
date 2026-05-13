/**
 * Endpoints — AI Draft Generation — Load Test
 * Mục tiêu: kiểm tra hành vi ở mức tải thông thường.
 *
 * Run:
 *   k6 run tests/endpoints/ai/load.js
 *   k6 run -e BASE_URL=http://staging:29002/api tests/endpoints/ai/load.js
 */

import { SharedArray } from 'k6/data';
import runFlow from '../../../endpoints/ai.flow.js';
import { buildSummary } from '../../../lib/report.js';

const users = new SharedArray('users', function () {
  return JSON.parse(open('../../../data/users.json'));
});

export const options = {
  stages: [
    { duration: '2m',  target: 20 },
    { duration: '15m', target: 20 },
    { duration: '3m',  target: 0  },
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<10000'],
    'http_req_duration{name:login}':            ['p(95)<800'],
    'http_req_duration{name:ai_template_draft}': ['p(95)<10000'],
    'http_req_duration{name:ai_rule_draft}':    ['p(95)<10000'],
  },
};

export default function () {
  runFlow(users);
}

export const handleSummary = buildSummary('ai-load');
