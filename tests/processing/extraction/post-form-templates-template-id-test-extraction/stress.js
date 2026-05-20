/**
 * extraction / post-form-templates-template-id-test-extraction — Stress Test
 * POST /v1/extraction/form-templates/{TEMPLATE_ID}/test-extraction
 *
 * Run:
 *   k6 run -e MAX_VU=100 tests/processing/extraction/post-form-templates-template-id-test-extraction/stress.js
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
    'http_req_duration{name:extraction_post_form_templates_template_id_test_extraction}': ['p(95)<5000'],
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
  const res = http.post(`${BASE_URL}/v1/extraction/form-templates/${TEMPLATE_ID}/test-extraction`, body, authParams(data.tokens, { tags: { name: 'extraction_post_form_templates_template_id_test_extraction' } }));
  check(res, {
    'extraction_post_form_templates_template_id_test_extraction: status 200/201': (r) => r.status === 200 || r.status === 201,
  });
  randomSleep(1, 2);
}

export const handleSummary = buildSummary('extraction-post-form-templates-template-id-test-extraction-stress');
