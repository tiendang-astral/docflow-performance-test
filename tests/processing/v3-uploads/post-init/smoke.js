/**
 * v3-uploads / post-init — Smoke Test
 * POST /v3/uploads/init
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
    'http_req_duration{name:v3_uploads_post_init}': ['p(95)<3000'],
  },
};

export function setup() {
  const user = getUser(users);
  const tokens = login(user);
  return { tokens };
}

export default function (data) {

  const body = __ENV.BODY_JSON ? __ENV.BODY_JSON : JSON.stringify({"dossier_id": 0, "filename": "string", "size_bytes": 0});
  const res = http.post(`${BASE_URL}/v3/uploads/init`, body, authParams(data.tokens, { tags: { name: 'v3_uploads_post_init' } }));
  check(res, {
    'v3_uploads_post_init: status 200/201': (r) => r.status === 200 || r.status === 201,
  });
  randomSleep(1, 2);
}
