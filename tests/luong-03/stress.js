/**
 * Luồng 03 — Stress Test
 * Mục tiêu: tìm điểm hệ thống bắt đầu suy giảm khi tải tăng dần.
 *
 * Run:
 *   k6 run tests/luong-03/stress.js
 *   k6 run -e BASE_URL=http://staging:29002/api tests/luong-03/stress.js
 */

import { SharedArray } from 'k6/data';
import runFlow from '../../flows/luong-03.flow.js';
import { buildSummary } from '../../lib/report.js';
import { stages } from '../../lib/stages.js';

const users = new SharedArray('users', function () {
  return JSON.parse(open('../../data/users.json'));
});

export const options = {
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
  stages: stages.stress,
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<3000'],
  },
};

export default function () {
  runFlow(users);
}

export const handleSummary = buildSummary('luong-03-stress');
