/**
 * monitor / get-validation — Stress Test
 * GET /v1/admin/monitor/validation
 *
 * Run:
 *   k6 run -e MAX_VU=100 tests/admin/monitor/get-validation/stress.js
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
    'http_req_duration{name:monitor_get_validation}': ['p(95)<5000'],
  },
};

export function setup() {
  const user = getUserByRole(users, 'admin');
  const tokens = login(user);
  return { tokens };
}

export default function (data) {

  const res = http.get(`${BASE_URL}/v1/admin/monitor/validation`, authParams(data.tokens, { tags: { name: 'monitor_get_validation' } }));
  check(res, {
    'monitor_get_validation: status 200': (r) => r.status === 200,
  });
  randomSleep(1, 2);
}

export const handleSummary = buildSummary('monitor-get-validation-stress');
