/**
 * Luồng 08 — Load Test
 * Mục tiêu: kiểm tra luồng gán file cho biểu mẫu ở mức tải thông thường.
 *
 * Run:
 *   k6 run tests/luong-08/load.js
 *   k6 run -e BASE_URL=http://staging:29002/api tests/luong-08/load.js
 */

import { SharedArray } from 'k6/data';
import runFlow from '../../flows/luong-08.flow.js';
import { buildSummary } from '../../lib/report.js';

const users = new SharedArray('users', function () {
  return JSON.parse(open('../../data/users.json'));
});

export const options = {
  stages: [
    { duration: '2m',  target: 20 },
    { duration: '15m', target: 20 },
    { duration: '3m',  target: 0  },
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<3000'],
    'http_req_duration{name:login}':                   ['p(95)<800'],
    'http_req_duration{name:list_approved_templates}': ['p(95)<1000'],
    'http_req_duration{name:upload_file}':             ['p(95)<3000'],
    'http_req_duration{name:assign_files}':            ['p(95)<1200'],
    'http_req_duration{name:get_form_content}':        ['p(95)<1200'],
  },
};

export default function () {
  runFlow(users);
}

export const handleSummary = buildSummary('luong-08-load');
