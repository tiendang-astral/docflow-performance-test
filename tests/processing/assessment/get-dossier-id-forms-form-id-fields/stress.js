/**
 * assessment / get-dossier-id-forms-form-id-fields — Stress Test
 * GET /v1/assessment/{DOSSIER_ID}/forms/{FORM_ID}/fields
 *
 * Run:
 *   k6 run -e MAX_VU=100 tests/processing/assessment/get-dossier-id-forms-form-id-fields/stress.js
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
    'http_req_duration{name:assessment_get_dossier_id_forms_form_id_fields}': ['p(95)<5000'],
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
  const res = http.get(`${BASE_URL}/v1/assessment/${DOSSIER_ID}/forms/${FORM_ID}/fields`, authParams(data.tokens, { tags: { name: 'assessment_get_dossier_id_forms_form_id_fields' } }));
  check(res, {
    'assessment_get_dossier_id_forms_form_id_fields: status 200': (r) => r.status === 200,
  });
  randomSleep(1, 2);
}

export const handleSummary = buildSummary('assessment-get-dossier-id-forms-form-id-fields-stress');
