/**
 * Designer Endpoints — Stress Test
 * Mục tiêu: tìm điểm hệ thống bắt đầu suy giảm dưới tải leo thang của nhóm endpoint designer.
 *
 * Run:
 *   k6 run tests/endpoints/designer/stress.js
 *   k6 run -e BASE_URL=http://staging:29002/api tests/endpoints/designer/stress.js
 */

import { SharedArray } from 'k6/data';
import runFlow from '../../../endpoints/designer.flow.js';
import { buildSummary } from '../../../lib/report.js';

const users = new SharedArray('users', function () {
  return JSON.parse(open('../../../data/users.json'));
});

export const options = {
  stages: [
    { duration: '2m', target: 20  },  // warm up
    { duration: '5m', target: 50  },  // ramp to moderate
    { duration: '5m', target: 100 },  // ramp to high
    { duration: '5m', target: 200 },  // peak stress
    { duration: '5m', target: 0   },  // ramp down
  ],
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<3000'],
  },
};

export default function () {
  runFlow(users);
}

export const handleSummary = buildSummary('endpoints-designer-stress');
