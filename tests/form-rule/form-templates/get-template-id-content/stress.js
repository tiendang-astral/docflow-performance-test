/**
 * form-templates / get-template-id-content — Stress Test
 * GET /v1/form-templates/{TEMPLATE_ID}/content
 *
 * Run:
 *   k6 run -e MAX_VU=100 tests/form-rule/form-templates/get-template-id-content/stress.js
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
    'http_req_duration{name:form_templates_get_template_id_content}': ['p(95)<5000'],
  },
};

export function setup() {
  const user = getUser(users);
  const tokens = login(user);
  return { tokens };
}

export default function (data) {
  const TEMPLATE_ID = __ENV.TEMPLATE_ID || ids['template_id'] || '1';
  const res = http.get(`${BASE_URL}/v1/form-templates/${TEMPLATE_ID}/content`, authParams(data.tokens, { tags: { name: 'form_templates_get_template_id_content' } }));
  check(res, {
    'form_templates_get_template_id_content: status 200': (r) => r.status === 200,
  });
  randomSleep(1, 2);
}

export const handleSummary = buildSummary('form-templates-get-template-id-content-stress');
