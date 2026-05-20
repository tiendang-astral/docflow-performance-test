/**
 * rules / get-rule-id — Stress Test
 * GET /v1/rules/{RULE_ID}
 *
 * Run:
 *   k6 run -e MAX_VU=100 tests/form-rule/rules/get-rule-id/stress.js
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
    'http_req_duration{name:rules_get_rule_id}': ['p(95)<5000'],
  },
};

export function setup() {
  const user = getUser(users);
  const tokens = login(user);
  return { tokens };
}

export default function (data) {
  const RULE_ID = __ENV.RULE_ID || ids['rule_id'] || '1';
  const res = http.get(`${BASE_URL}/v1/rules/${RULE_ID}`, authParams(data.tokens, { tags: { name: 'rules_get_rule_id' } }));
  check(res, {
    'rules_get_rule_id: status 200': (r) => r.status === 200,
  });
  randomSleep(1, 2);
}

export const handleSummary = buildSummary('rules-get-rule-id-stress');
