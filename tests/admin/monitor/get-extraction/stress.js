/**
 * monitor / get-extraction — Stress Test
 * GET /v1/admin/monitor/extraction
 *
 * Run:
 *   k6 run -e MAX_VU=100 tests/admin/monitor/get-extraction/stress.js
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
    'http_req_duration{name:monitor_get_extraction}': ['p(95)<5000'],
  },
};

export function setup() {
  const user = getUserByRole(users, 'admin');
  const tokens = login(user);
  return { tokens };
}

export default function (data) {

  const res = http.get(`${BASE_URL}/v1/admin/monitor/extraction`, authParams(data.tokens, { tags: { name: 'monitor_get_extraction' } }));
  check(res, {
    'monitor_get_extraction: status 200': (r) => r.status === 200,
  });
  randomSleep(1, 2);
}

export const handleSummary = buildSummary('monitor-get-extraction-stress');
