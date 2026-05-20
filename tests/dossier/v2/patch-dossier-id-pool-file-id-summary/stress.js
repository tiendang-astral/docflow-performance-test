/**
 * v2 / patch-dossier-id-pool-file-id-summary — Stress Test
 * PATCH /v2/dossiers/{DOSSIER_ID}/pool/{FILE_ID}/summary
 *
 * Run:
 *   k6 run -e MAX_VU=100 tests/dossier/v2/patch-dossier-id-pool-file-id-summary/stress.js
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
    'http_req_duration{name:v2_patch_dossier_id_pool_file_id_summary}': ['p(95)<5000'],
  },
};

export function setup() {
  const user = getUser(users);
  const tokens = login(user);
  return { tokens };
}

export default function (data) {
  const DOSSIER_ID = __ENV.DOSSIER_ID || ids['dossier_id'] || '1';
  const FILE_ID = __ENV.FILE_ID || ids['file_id'] || '1';
  const body = __ENV.BODY_JSON ? __ENV.BODY_JSON : JSON.stringify({"summary": "string"});
  const res = http.patch(`${BASE_URL}/v2/dossiers/${DOSSIER_ID}/pool/${FILE_ID}/summary`, body, authParams(data.tokens, { tags: { name: 'v2_patch_dossier_id_pool_file_id_summary' } }));
  check(res, {
    'v2_patch_dossier_id_pool_file_id_summary: status 200': (r) => r.status === 200,
  });
  randomSleep(1, 2);
}

export const handleSummary = buildSummary('v2-patch-dossier-id-pool-file-id-summary-stress');
