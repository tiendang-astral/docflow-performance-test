/**
 * departments / post-departments — Smoke Test
 * POST /v1/departments
 */

import http from 'k6/http';
import { check } from 'k6';
import { SharedArray } from 'k6/data';
import { BASE_URL, login, authParams } from '../../../../lib/auth.js';
import { getUser, getUserByRole, randomSleep } from '../../../../lib/utils.js';

const users = new SharedArray('users', function () {
  return JSON.parse(open('../../../../data/users.json'));
});

// data/ids.json: ID entity thật do scripts/seed.py tạo; rỗng nếu chưa seed.
const ids = (function () {
  try { return JSON.parse(open('../../../../data/ids.json')); }
  catch (e) { return {}; }
})();

export const options = {
  vus: 1,
  iterations: 1,  // smoke chỉ chạy 1 lần để DELETE/POST không phá state
  thresholds: {
    http_req_failed: ['rate<0.05'],
    'http_req_duration{name:departments_post_departments}': ['p(95)<3000'],
  },
};

export function setup() {
  const user = getUserByRole(users, 'admin');
  const tokens = login(user);
  return { tokens };
}

export default function (data) {

  const body = __ENV.BODY_JSON ? __ENV.BODY_JSON : JSON.stringify({"name": "string"});
  const res = http.post(`${BASE_URL}/v1/departments`, body, authParams(data.tokens, { tags: { name: 'departments_post_departments' } }));
  check(res, {
    'departments_post_departments: status 200/201': (r) => r.status === 200 || r.status === 201,
  });
  randomSleep(1, 2);
}
