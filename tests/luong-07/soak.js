/**
 * Luồng 07 — Soak Test
 * Mục tiêu: phát hiện memory/storage leak khi upload tài liệu liên tục trong 2 giờ.
 *
 * Run:
 *   k6 run tests/luong-07/soak.js
 *   k6 run -e BASE_URL=http://staging:29002/api tests/luong-07/soak.js
 */

import { SharedArray } from 'k6/data';
import runFlow from '../../flows/luong-07.flow.js';
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
    http_req_duration: ['p(95)<5000'],
    'http_req_duration{name:upload_file}':    ['p(95)<3000'],
    'http_req_duration{name:reconvert_file}': ['p(95)<3000'],
  },
};

export default function () {
  runFlow(users);
}

export const handleSummary = buildSummary('luong-07-soak');
