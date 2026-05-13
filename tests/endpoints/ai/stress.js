/**
 * Endpoints — AI Draft Generation — Stress Test
 * Mục tiêu: tìm điểm hệ thống bắt đầu suy giảm khi tải tăng dần.
 *
 * Run:
 *   k6 run tests/endpoints/ai/stress.js
 *   k6 run -e BASE_URL=http://staging:29002/api tests/endpoints/ai/stress.js
 */

import { SharedArray } from 'k6/data';
import runFlow from '../../../endpoints/ai.flow.js';
import { buildSummary } from '../../../lib/report.js';

const users = new SharedArray('users', function () {
  return JSON.parse(open('../../../data/users.json'));
});

export const options = {
  stages: [
    { duration: '2m', target: 20  },
    { duration: '5m', target: 50  },
    { duration: '5m', target: 100 },
    { duration: '5m', target: 200 },
    { duration: '5m', target: 0   },
  ],
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<15000'],
  },
};

export default function () {
  runFlow(users);
}

export const handleSummary = buildSummary('ai-stress');
