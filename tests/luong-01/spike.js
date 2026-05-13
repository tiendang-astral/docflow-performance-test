/**
 * Luồng 01 — Spike Test
 * Mục tiêu: kiểm tra hệ thống khi traffic tăng đột ngột (5 → 100 VUs trong 30s).
 *
 * Run:
 *   k6 run tests/luong-01/spike.js
 */

import { SharedArray } from 'k6/data';
import runFlow from '../../flows/luong-01.flow.js';
import { buildSummary } from '../../lib/report.js';

const users = new SharedArray('users', function () {
  return JSON.parse(open('../../data/users.json'));
});

export const options = {
  stages: [
    { duration: '30s', target: 5 },    // baseline
    { duration: '30s', target: 100 },  // spike
    { duration: '1m', target: 100 },   // hold spike
    { duration: '30s', target: 5 },    // recovery
    { duration: '30s', target: 0 },    // cool down
  ],
  thresholds: {
    http_req_failed: ['rate<0.10'],
    http_req_duration: ['p(95)<5000'],
  },
};

export default function () {
  runFlow(users);
}

export const handleSummary = buildSummary('luong-01-spike');
