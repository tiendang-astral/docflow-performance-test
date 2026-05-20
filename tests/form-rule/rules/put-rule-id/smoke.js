/**
 * rules / put-rule-id — Smoke Test
 * PUT /v1/rules/{RULE_ID}
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
    'http_req_duration{name:rules_put_rule_id}': ['p(95)<3000'],
  },
};

export function setup() {
  const user = getUser(users);
  const tokens = login(user);
  return { tokens };
}

export default function (data) {
  const RULE_ID = __ENV.RULE_ID || ids['rule_id'] || '1';
  const body = __ENV.BODY_JSON ? __ENV.BODY_JSON : JSON.stringify({"name": "string", "description": "string", "tags": ["string"], "condition": "string", "rule_type": "prompt", "severity": "error", "is_active": false});
  const res = http.put(`${BASE_URL}/v1/rules/${RULE_ID}`, body, authParams(data.tokens, { tags: { name: 'rules_put_rule_id' } }));
  check(res, {
    'rules_put_rule_id: status 200': (r) => r.status === 200,
  });
  randomSleep(1, 2);
}
