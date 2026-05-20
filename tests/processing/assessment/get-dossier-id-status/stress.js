/**
 * assessment / get-dossier-id-status — Stress Test
 * GET /v1/assessment/{DOSSIER_ID}/status
 *
 * Run:
 *   k6 run -e MAX_VU=100 tests/processing/assessment/get-dossier-id-status/stress.js
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
    'http_req_duration{name:assessment_get_dossier_id_status}': ['p(95)<5000'],
  },
};

export function setup() {
  const user = getUser(users);
  const tokens = login(user);
  return { tokens };
}

export default function (data) {
  const DOSSIER_ID = __ENV.DOSSIER_ID || ids['dossier_id'] || '1';
  const res = http.get(`${BASE_URL}/v1/assessment/${DOSSIER_ID}/status`, authParams(data.tokens, { tags: { name: 'assessment_get_dossier_id_status' } }));
  check(res, {
    'assessment_get_dossier_id_status: status 200': (r) => r.status === 200,
  });
  randomSleep(1, 2);
}

export const handleSummary = buildSummary('assessment-get-dossier-id-status-stress');
