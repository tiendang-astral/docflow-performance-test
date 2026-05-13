/**
 * Luồng 01 — Soak Test
 * Mục tiêu: kiểm tra memory leak, connection leak hoặc queue backlog khi chạy dài.
 * Thời gian: ~2 giờ 10 phút ở 20 VUs.
 *
 * Run:
 *   k6 run tests/luong-01/soak.js
 */

import { SharedArray } from 'k6/data';
import runFlow from '../../flows/luong-01.flow.js';
import { buildSummary } from '../../lib/report.js';

const users = new SharedArray('users', function () {
  return JSON.parse(open('../../data/users.json'));
});

export const options = {
  stages: [
    { duration: '5m', target: 20 },   // ramp up
    { duration: '2h', target: 20 },   // sustained load
    { duration: '5m', target: 0 },    // ramp down
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<2000'],
    'http_req_duration{name:login}': ['p(95)<800'],
    'http_req_duration{name:list_departments}': ['p(95)<1000'],
  },
};

export default function () {
  runFlow(users);
}

export const handleSummary = buildSummary('luong-01-soak');
