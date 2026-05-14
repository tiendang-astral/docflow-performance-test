/**
 * Designer Endpoints — Spike Test
 * Mục tiêu: kiểm tra hành vi khi lưu lượng tăng đột biến trên nhóm endpoint designer.
 *
 * Run:
 *   k6 run tests/endpoints/designer/spike.js
 *   k6 run -e BASE_URL=http://staging:29002/api tests/endpoints/designer/spike.js
 */

import { SharedArray } from 'k6/data';
import runFlow from '../../../endpoints/designer.flow.js';
import { buildSummary } from '../../../lib/report.js';

const users = new SharedArray('users', function () {
  return JSON.parse(open('../../../data/users.json'));
});

export const options = {
  stages: [
    { duration: '30s', target: 5   },  // baseline
    { duration: '30s', target: 100 },  // spike
    { duration: '1m',  target: 100 },  // hold spike
    { duration: '30s', target: 5   },  // recovery
    { duration: '30s', target: 0   },  // cool down
  ],
  thresholds: {
    http_req_failed: ['rate<0.10'],
    http_req_duration: ['p(95)<5000'],
  },
};

export default function () {
  runFlow(users);
}

export const handleSummary = buildSummary('endpoints-designer-spike');
