/**
 * form-templates / put-template-id-extracted-fields — Stress Test
 * PUT /v1/form-templates/{TEMPLATE_ID}/extracted-fields
 *
 * Run:
 *   k6 run -e MAX_VU=100 tests/form-rule/form-templates/put-template-id-extracted-fields/stress.js
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
    'http_req_duration{name:form_templates_put_template_id_extracted_fields}': ['p(95)<5000'],
  },
};

export function setup() {
  const user = getUser(users);
  const tokens = login(user);
  return { tokens };
}

export default function (data) {
  const TEMPLATE_ID = __ENV.TEMPLATE_ID || ids['template_id'] || '1';
  const body = __ENV.BODY_JSON ? __ENV.BODY_JSON : JSON.stringify({});
  const res = http.put(`${BASE_URL}/v1/form-templates/${TEMPLATE_ID}/extracted-fields`, body, authParams(data.tokens, { tags: { name: 'form_templates_put_template_id_extracted_fields' } }));
  check(res, {
    'form_templates_put_template_id_extracted_fields: status 200': (r) => r.status === 200,
  });
  randomSleep(1, 2);
}

export const handleSummary = buildSummary('form-templates-put-template-id-extracted-fields-stress');
