/**
 * Luồng 04 — Soak Test
 * Mục tiêu: phát hiện vấn đề khi hệ thống duyệt liên tục trong thời gian dài.
 *
 * Run:
 *   k6 run tests/luong-04/soak.js
 *   k6 run -e BASE_URL=http://staging:29002/api tests/luong-04/soak.js
 */

import { SharedArray } from 'k6/data';
import runFlow from '../../flows/luong-04.flow.js';
import { buildSummary } from '../../lib/report.js';

const users = new SharedArray('users', function () {
  return JSON.parse(open('../../data/users.json'));
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
    'http_req_duration{name:list_pending_templates}': ['p(95)<1000'],
    'http_req_duration{name:list_pending_rules}':     ['p(95)<1000'],
  },
};

export default function () {
  runFlow(users);
}

export const handleSummary = buildSummary('luong-04-soak');
