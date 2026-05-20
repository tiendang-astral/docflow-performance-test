/**
 * assessment / put-dossier-id-forms-form-id-fields-field-id-verify — Smoke Test
 * PUT /v1/assessment/{DOSSIER_ID}/forms/{FORM_ID}/fields/{FIELD_ID}/verify
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
    'http_req_duration{name:assessment_put_dossier_id_forms_form_id_fields_field_id_verify}': ['p(95)<3000'],
  },
};

export function setup() {
  const user = getUser(users);
  const tokens = login(user);
  return { tokens };
}

export default function (data) {
  const DOSSIER_ID = __ENV.DOSSIER_ID || ids['dossier_id'] || '1';
  const FORM_ID = __ENV.FORM_ID || ids['form_id'] || '1';
  const FIELD_ID = __ENV.FIELD_ID || ids['field_id'] || '1';
  const body = __ENV.BODY_JSON ? __ENV.BODY_JSON : JSON.stringify({});
  const res = http.put(`${BASE_URL}/v1/assessment/${DOSSIER_ID}/forms/${FORM_ID}/fields/${FIELD_ID}/verify`, body, authParams(data.tokens, { tags: { name: 'assessment_put_dossier_id_forms_form_id_fields_field_id_verify' } }));
  check(res, {
    'assessment_put_dossier_id_forms_form_id_fields_field_id_verify: status 200': (r) => r.status === 200,
  });
  randomSleep(1, 2);
}
