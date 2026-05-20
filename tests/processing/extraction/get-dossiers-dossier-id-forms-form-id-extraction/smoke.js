/**
 * extraction / get-dossiers-dossier-id-forms-form-id-extraction — Smoke Test
 * GET /v1/extraction/dossiers/{DOSSIER_ID}/forms/{FORM_ID}/extraction
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
    'http_req_duration{name:extraction_get_dossiers_dossier_id_forms_form_id_extraction}': ['p(95)<3000'],
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
  const res = http.get(`${BASE_URL}/v1/extraction/dossiers/${DOSSIER_ID}/forms/${FORM_ID}/extraction`, authParams(data.tokens, { tags: { name: 'extraction_get_dossiers_dossier_id_forms_form_id_extraction' } }));
  check(res, {
    'extraction_get_dossiers_dossier_id_forms_form_id_extraction: status 200': (r) => r.status === 200,
  });
  randomSleep(1, 2);
}
