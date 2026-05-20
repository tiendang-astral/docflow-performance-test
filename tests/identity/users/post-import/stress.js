/**
 * users / post-import — Stress Test
 * POST /v1/users/import
 *
 * Run:
 *   k6 run -e MAX_VU=100 tests/identity/users/post-import/stress.js
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
    'http_req_duration{name:users_post_import}': ['p(95)<5000'],
  },
};

export function setup() {
  const user = getUserByRole(users, 'admin');
  const tokens = login(user);
  return { tokens };
}

export default function (data) {

  const body = __ENV.BODY_JSON ? __ENV.BODY_JSON : JSON.stringify({});
  const res = http.post(`${BASE_URL}/v1/users/import`, body, authParams(data.tokens, { tags: { name: 'users_post_import' } }));
  check(res, {
    'users_post_import: status 200/201': (r) => r.status === 200 || r.status === 201,
  });
  randomSleep(1, 2);
}

export const handleSummary = buildSummary('users-post-import-stress');
