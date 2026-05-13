/**
 * Luồng 08 — Soak Test
 * Mục tiêu: phát hiện memory/connection leak khi gán file cho biểu mẫu liên tục trong 2 giờ.
 *
 * Run:
 *   k6 run tests/luong-08/soak.js
 *   k6 run -e BASE_URL=http://staging:29002/api tests/luong-08/soak.js
 */

import { SharedArray } from 'k6/data';
import runFlow from '../../flows/luong-08.flow.js';
import { buildSummary } from '../../lib/report.js';

const users = new SharedArray('users', function () {
  return JSON.parse(open('../../data/users.json'));
});

export const options = {
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
  stages: [
    { duration: '5m', target: 20 },
    { duration: '2h', target: 20 },
    { duration: '5m', target: 0  },
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<5000'],
    'http_req_duration{name:upload_file}':      ['p(95)<3000'],
    'http_req_duration{name:assign_files}':     ['p(95)<1200'],
    'http_req_duration{name:get_form_content}': ['p(95)<1200'],
  },
};

export default function () {
  runFlow(users);
}

export const handleSummary = buildSummary('luong-08-soak');
