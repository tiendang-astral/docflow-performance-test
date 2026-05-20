/**
 * templates / post-template-id-fields — Stress Test
 * POST /v1/templates/{TEMPLATE_ID}/fields
 *
 * Run:
 *   k6 run -e MAX_VU=100 tests/form-rule/templates/post-template-id-fields/stress.js
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
    'http_req_duration{name:templates_post_template_id_fields}': ['p(95)<5000'],
  },
};

export function setup() {
  const user = getUser(users);
  const tokens = login(user);
  return { tokens };
}

export default function (data) {
  const TEMPLATE_ID = __ENV.TEMPLATE_ID || ids['template_id'] || '1';
  const body = __ENV.BODY_JSON ? __ENV.BODY_JSON : JSON.stringify({"field_id": "string", "field_name": "string", "field_type": "text"});
  const res = http.post(`${BASE_URL}/v1/templates/${TEMPLATE_ID}/fields`, body, authParams(data.tokens, { tags: { name: 'templates_post_template_id_fields' } }));
  check(res, {
    'templates_post_template_id_fields: status 200/201': (r) => r.status === 200 || r.status === 201,
  });
  randomSleep(1, 2);
}

export const handleSummary = buildSummary('templates-post-template-id-fields-stress');
