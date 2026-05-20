/**
 * assessment / post-dossier-id-forms-form-id-verify-all — Stress Test
 * POST /v1/assessment/{DOSSIER_ID}/forms/{FORM_ID}/verify-all
 *
 * Run:
 *   k6 run -e MAX_VU=100 tests/processing/assessment/post-dossier-id-forms-form-id-verify-all/stress.js
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
    'http_req_duration{name:assessment_post_dossier_id_forms_form_id_verify_all}': ['p(95)<5000'],
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
  const body = __ENV.BODY_JSON ? __ENV.BODY_JSON : JSON.stringify({});
  const res = http.post(`${BASE_URL}/v1/assessment/${DOSSIER_ID}/forms/${FORM_ID}/verify-all`, body, authParams(data.tokens, { tags: { name: 'assessment_post_dossier_id_forms_form_id_verify_all' } }));
  check(res, {
    'assessment_post_dossier_id_forms_form_id_verify_all: status 200/201': (r) => r.status === 200 || r.status === 201,
  });
  randomSleep(1, 2);
}

export const handleSummary = buildSummary('assessment-post-dossier-id-forms-form-id-verify-all-stress');
