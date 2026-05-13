/**
 * Endpoint: users — Smoke Test
 * Mục tiêu: xác nhận script và môi trường hoạt động đúng với tải tối thiểu.
 *
 * Run:
 *   k6 run tests/endpoints/users/smoke.js
 *   k6 run -e BASE_URL=http://staging:29002/api tests/endpoints/users/smoke.js
 */

import { SharedArray } from 'k6/data';
import runFlow from '../../../endpoints/users.flow.js';
import { buildSummary } from '../../../lib/report.js';

const users = new SharedArray('users', function () {
  return JSON.parse(open('../../../data/users.json'));
});

export const options = {
  vus: 1,
  duration: '10s',
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{name:login}':           ['p(95)<800'],
    'http_req_duration{name:list_users}':      ['p(95)<1000'],
    'http_req_duration{name:create_user}':     ['p(95)<1200'],
    'http_req_duration{name:get_user}':        ['p(95)<1000'],
    'http_req_duration{name:update_user}':     ['p(95)<1200'],
    'http_req_duration{name:deactivate_user}': ['p(95)<1200'],
    'http_req_duration{name:activate_user}':   ['p(95)<1200'],
    'http_req_duration{name:delete_user}':     ['p(95)<1200'],
  },
};

export default function () {
  runFlow(users);
}

export const handleSummary = buildSummary('users-smoke');
