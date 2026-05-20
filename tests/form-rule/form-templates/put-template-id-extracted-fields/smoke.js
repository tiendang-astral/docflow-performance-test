/**
 * form-templates / put-template-id-extracted-fields — Smoke Test
 * PUT /v1/form-templates/{TEMPLATE_ID}/extracted-fields
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
    'http_req_duration{name:form_templates_put_template_id_extracted_fields}': ['p(95)<3000'],
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
