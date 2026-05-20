/**
 * v2 / post-import-confirm — Smoke Test
 * POST /v2/dossiers/import/confirm
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
    'http_req_duration{name:v2_post_import_confirm}': ['p(95)<3000'],
  },
};

export function setup() {
  const user = getUser(users);
  const tokens = login(user);
  return { tokens };
}

export default function (data) {

  const body = __ENV.BODY_JSON ? __ENV.BODY_JSON : JSON.stringify({"import_data": {}});
  const res = http.post(`${BASE_URL}/v2/dossiers/import/confirm`, body, authParams(data.tokens, { tags: { name: 'v2_post_import_confirm' } }));
  check(res, {
    'v2_post_import_confirm: status 200/201': (r) => r.status === 200 || r.status === 201,
  });
  randomSleep(1, 2);
}
