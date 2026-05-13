/**
 * Endpoints — Rules — Soak Test
 * Mục tiêu: phát hiện memory leak, connection leak khi tải kéo dài.
 *
 * Run:
 *   k6 run tests/endpoints/rules/soak.js
 *   k6 run -e BASE_URL=http://staging:29002/api tests/endpoints/rules/soak.js
 */

import { SharedArray } from 'k6/data';
import runFlow from '../../../endpoints/rules.flow.js';
import { buildSummary } from '../../../lib/report.js';

const users = new SharedArray('users', function () {
  return JSON.parse(open('../../../data/users.json'));
});

export const options = {
  stages: [
    { duration: '5m', target: 20 },
    { duration: '2h', target: 20 },
    { duration: '5m', target: 0  },
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<2000'],
    'http_req_duration{name:list_rules}':      ['p(95)<1000'],
    'http_req_duration{name:create_rule}':     ['p(95)<1200'],
    'http_req_duration{name:get_rule}':        ['p(95)<1200'],
    'http_req_duration{name:update_rule}':     ['p(95)<1200'],
    'http_req_duration{name:delete_rule}':     ['p(95)<1200'],
  },
};

export default function () {
  runFlow(users);
}

export const handleSummary = buildSummary('rules-soak');
