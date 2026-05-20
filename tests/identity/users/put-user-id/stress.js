/**
 * users / put-user-id — Stress Test
 * PUT /v1/users/{USER_ID}
 *
 * Run:
 *   k6 run -e MAX_VU=100 tests/identity/users/put-user-id/stress.js
 */

import http from 'k6/http';
import { check } from 'k6';
import { SharedArray } from 'k6/data';
import { BASE_URL, login, authParams } from '../../../../lib/auth.js';
import { getUser, getUserByRole, randomSleep } from '../../../../lib/utils.js';
import { buildSummary } from '../../../../lib/report.js';
import { stages } from '../../../../lib/stages.js';

const users = new SharedArray('users', function () {
  return JSON.parse(open('../../../../data/users.json'));
});

const ids = (function () {
  try { return JSON.parse(open('../../../../data/ids.json')); }
  catch (e) { return {}; }
})();

export const options = {
  stages: stages.stress,
  thresholds: {
    http_req_failed: ['rate<0.10'],
    'http_req_duration{name:users_put_user_id}': ['p(95)<5000'],
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

export const handleSummary = buildSummary('users-put-user-id-stress');
