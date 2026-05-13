/**
 * Luồng 01 — Load Test
 * Mục tiêu: kiểm tra hệ thống ở tải bình thường (20 VUs trong 15 phút).
 *
 * Run:
 *   k6 run tests/luong-01/load.js
 */

import { SharedArray } from 'k6/data';
import runFlow from '../../flows/luong-01.flow.js';
import { buildSummary } from '../../lib/report.js';

const users = new SharedArray('users', function () {
  return JSON.parse(open('../../data/users.json'));
});

export const options = {
  stages: [
    { duration: '2m', target: 20 },   // ramp up
    { duration: '15m', target: 20 },  // steady state
    { duration: '3m', target: 0 },    // ramp down
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1000'],
    'http_req_duration{name:login}': ['p(95)<800'],
    'http_req_duration{name:list_departments}': ['p(95)<1000'],
    'http_req_duration{name:get_department}': ['p(95)<1000'],
  },
};

export default function () {
  runFlow(users);
}

export const handleSummary = buildSummary('luong-01-load');
