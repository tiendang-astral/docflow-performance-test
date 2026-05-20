/**
 * v2 / put-dossier-id-routing-guidance — Smoke Test
 * PUT /v2/dossiers/{DOSSIER_ID}/routing-guidance
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
    'http_req_duration{name:v2_put_dossier_id_routing_guidance}': ['p(95)<3000'],
  },
};

export function setup() {
  const user = getUser(users);
  const tokens = login(user);
  return { tokens };
}

export default function (data) {
  const DOSSIER_ID = __ENV.DOSSIER_ID || ids['dossier_id'] || '1';
  const body = __ENV.BODY_JSON ? __ENV.BODY_JSON : JSON.stringify({"prompt": ""});
  const res = http.put(`${BASE_URL}/v2/dossiers/${DOSSIER_ID}/routing-guidance`, body, authParams(data.tokens, { tags: { name: 'v2_put_dossier_id_routing_guidance' } }));
  check(res, {
    'v2_put_dossier_id_routing_guidance: status 200': (r) => r.status === 200,
  });
  randomSleep(1, 2);
}
