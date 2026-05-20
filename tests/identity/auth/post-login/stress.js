/**
 * auth / post-login — Stress Test
 * POST /v1/auth/login
 *
 * Run:
 *   k6 run -e MAX_VU=100 tests/identity/auth/post-login/stress.js
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
    'http_req_duration{name:auth_post_login}': ['p(95)<5000'],
  },
};

export function setup() {
  const user = getUser(users);
  const tokens = login(user);
  return { tokens };
}

export default function (data) {

  const body = __ENV.BODY_JSON ? __ENV.BODY_JSON : JSON.stringify({"username": "string", "password": "string"});
  const res = http.post(`${BASE_URL}/v1/auth/login`, body, authParams(data.tokens, { tags: { name: 'auth_post_login' } }));
  check(res, {
    'auth_post_login: status 200/201': (r) => r.status === 200 || r.status === 201,
  });
  randomSleep(1, 2);
}

export const handleSummary = buildSummary('auth-post-login-stress');
