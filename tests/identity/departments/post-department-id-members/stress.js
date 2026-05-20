/**
 * departments / post-department-id-members — Stress Test
 * POST /v1/departments/{DEPARTMENT_ID}/members
 *
 * Run:
 *   k6 run -e MAX_VU=100 tests/identity/departments/post-department-id-members/stress.js
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
    'http_req_duration{name:departments_post_department_id_members}': ['p(95)<5000'],
  },
};

export function setup() {
  const user = getUserByRole(users, 'admin');
  const tokens = login(user);
  return { tokens };
}

export default function (data) {
  const DEPARTMENT_ID = __ENV.DEPARTMENT_ID || ids['department_id'] || '1';
  const body = __ENV.BODY_JSON ? __ENV.BODY_JSON : JSON.stringify({"user_id": 0});
  const res = http.post(`${BASE_URL}/v1/departments/${DEPARTMENT_ID}/members`, body, authParams(data.tokens, { tags: { name: 'departments_post_department_id_members' } }));
  check(res, {
    'departments_post_department_id_members: status 200/201': (r) => r.status === 200 || r.status === 201,
  });
  randomSleep(1, 2);
}

export const handleSummary = buildSummary('departments-post-department-id-members-stress');
