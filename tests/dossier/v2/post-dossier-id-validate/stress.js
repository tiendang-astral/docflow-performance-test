/**
 * v2 / post-dossier-id-validate — Stress Test
 * POST /v2/dossiers/{DOSSIER_ID}/validate
 *
 * Run:
 *   k6 run -e MAX_VU=100 tests/dossier/v2/post-dossier-id-validate/stress.js
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
    'http_req_duration{name:v2_post_dossier_id_validate}': ['p(95)<5000'],
  },
};

export function setup() {
  const user = getUser(users);
  const tokens = login(user);
  return { tokens };
}

export default function (data) {
  const DOSSIER_ID = __ENV.DOSSIER_ID || ids['dossier_id'] || '1';
  const body = __ENV.BODY_JSON ? __ENV.BODY_JSON : JSON.stringify({});
  const res = http.post(`${BASE_URL}/v2/dossiers/${DOSSIER_ID}/validate`, body, authParams(data.tokens, { tags: { name: 'v2_post_dossier_id_validate' } }));
  check(res, {
    'v2_post_dossier_id_validate: status 200/201': (r) => r.status === 200 || r.status === 201,
  });
  randomSleep(1, 2);
}

export const handleSummary = buildSummary('v2-post-dossier-id-validate-stress');
