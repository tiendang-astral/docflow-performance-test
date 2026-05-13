/**
 * Luồng 01 — Stress Test
 * Mục tiêu: tìm ngưỡng hệ thống bắt đầu chậm hoặc lỗi.
 * VUs tăng dần: 20 → 50 → 100 → 200.
 *
 * Run:
 *   k6 run tests/luong-01/stress.js
 */

import { SharedArray } from 'k6/data';
import runFlow from '../../flows/luong-01.flow.js';
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

export const handleSummary = buildSummary('luong-01-stress');
