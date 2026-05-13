/**
 * Luồng 05 — Soak Test
 * Mục tiêu: phát hiện memory/connection leak khi tạo hồ sơ liên tục trong thời gian dài.
 *
 * Run:
 *   k6 run tests/luong-05/soak.js
 *   k6 run -e BASE_URL=http://staging:29002/api tests/luong-05/soak.js
 */

import { SharedArray } from 'k6/data';
import runFlow from '../../flows/luong-05.flow.js';
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
    'http_req_duration{name:create_dossier}': ['p(95)<1200'],
    'http_req_duration{name:get_canvas}':     ['p(95)<1200'],
    'http_req_duration{name:save_canvas}':    ['p(95)<1200'],
  },
};

export default function () {
  runFlow(users);
}

export const handleSummary = buildSummary('luong-05-soak');
