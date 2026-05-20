/**
 * Stress test — GET /v1/assessment/dossiers
 *
 * Chạy:
 *   k6 run tests/assessment/stress/list.js
 *   k6 run -e MAX_VU=20 tests/assessment/stress/list.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';

import { login, authParams } from '../../../lib/auth.js';
import { stages } from '../../../lib/stages.js';
import { buildSummary } from '../../../lib/report.js';
import {
  getAdminUser,
  ASSESSMENT_DOSSIERS_URL,
} from '../../../lib/assessment-helper.js';
import { randomIntBetween } from '../../../lib/utils.js';

const users = new SharedArray('users', () =>
  JSON.parse(open('../../../data/seed/users.json'))
);

export const options = {
  stages: stages.stress,
  thresholds: {
    checks: ['rate>0.95'],
    http_req_failed: ['rate<0.05'],
    'http_req_duration{name:assessment_list}': ['p(95)<2500'],
  },
};

export function setup() {
  const admin = getAdminUser(users);
  const tokens = login(admin);
  if (!tokens.accessToken) throw new Error(`login failed for ${admin.username}`);
  return { tokens };
}

export default function ({ tokens }) {
  const res = http.get(ASSESSMENT_DOSSIERS_URL,
    authParams(tokens, { tags: { name: 'assessment_list' } }));

  check(res, {
    'list: 200': (r) => r.status === 200,
    'list: response is array-like': (r) => {
      const body = r.json();
      const items = Array.isArray(body) ? body : (body?.data ?? body?.items ?? []);
      return Array.isArray(items);
    },
  });

  sleep(randomIntBetween(1, 3));
}

export const handleSummary = buildSummary('assessment-list-stress');
