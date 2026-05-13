/**
 * Luồng 02 — Stress Test
 * Mục tiêu: tìm điểm hệ thống bắt đầu suy giảm khi tải tăng dần.
 *
 * Run:
 *   k6 run tests/luong-02/stress.js
 *   k6 run -e BASE_URL=http://staging:29002/api tests/luong-02/stress.js
 *   k6 run -e QUICK=false tests/luong-02/stress.js   # full 22-min run
 */

import { SharedArray } from 'k6/data';
import runFlow from '../../flows/luong-02.flow.js';
import { buildSummary } from '../../lib/report.js';
import { stages } from '../../lib/stages.js';

const users = new SharedArray('users', function () {
  return JSON.parse(open('../../data/users.json'));
});

export const options = {
  stages: stages.stress,
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<3000'],
  },
};

export default function () {
  runFlow(users);
}

export const handleSummary = buildSummary('luong-02-stress');
