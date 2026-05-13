/**
 * Luồng 02 — Spike Test
 * Mục tiêu: kiểm tra hành vi hệ thống khi có đột biến lưu lượng bất ngờ.
 *
 * Run:
 *   k6 run tests/luong-02/spike.js
 *   k6 run -e BASE_URL=http://staging:29002/api tests/luong-02/spike.js
 */

import { SharedArray } from 'k6/data';
import runFlow from '../../flows/luong-02.flow.js';
import { buildSummary } from '../../lib/report.js';
import { stages } from '../../lib/stages.js';

const users = new SharedArray('users', function () {
  return JSON.parse(open('../../data/users.json'));
});

export const options = {
  stages: stages.spike,
  thresholds: {
    http_req_failed: ['rate<0.10'],
    http_req_duration: ['p(95)<5000'],
  },
};

export default function () {
  runFlow(users);
}

export const handleSummary = buildSummary('luong-02-spike');
