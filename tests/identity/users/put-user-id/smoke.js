/**
 * users / put-user-id — Smoke Test
 * PUT /v1/users/{USER_ID}
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
    'http_req_duration{name:users_put_user_id}': ['p(95)<3000'],
  },
};

export function setup() {
  const user = getUserByRole(users, 'admin');
  const tokens = login(user);
  return { tokens };
}

export default function (data) {
  const USER_ID = __ENV.USER_ID || ids['user_id'] || '1';
  const body = __ENV.BODY_JSON ? __ENV.BODY_JSON : JSON.stringify({"email": "string", "full_name": "string", "role": "admin", "is_active": false, "password": "string"});
  const res = http.put(`${BASE_URL}/v1/users/${USER_ID}`, body, authParams(data.tokens, { tags: { name: 'users_put_user_id' } }));
  check(res, {
    'users_put_user_id: status 200': (r) => r.status === 200,
  });
  randomSleep(1, 2);
}
