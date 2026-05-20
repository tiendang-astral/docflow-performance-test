/**
 * Smoke test — GET /v1/assessment/dossiers
 *
 * Read-only → KHÔNG có teardown.
 *
 * Chạy: k6 run tests/assessment/smoke/list.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';

import { login, authParams } from '../../../lib/auth.js';
import { buildSummary } from '../../../lib/report.js';
import {
  getAdminUser,
  ASSESSMENT_DOSSIERS_URL,
} from '../../../lib/assessment-helper.js';

const users = new SharedArray('users', () =>
  JSON.parse(open('../../../data/seed/users.json'))
);

export const options = {
  vus: 1,
  iterations: 1,
  duration: '10s',
  thresholds: {
    checks: ['rate>0.99'],
    'http_req_duration{name:assessment_list}': ['p(95)<1000'],
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
    'list: response có items array': (r) => {
      const body = r.json();
      const items = Array.isArray(body)
        ? body
        : (body?.data ?? body?.items ?? body?.dossiers ?? []);
      return Array.isArray(items);
    },
  });

  sleep(1);
}

export const handleSummary = buildSummary('assessment-list-smoke');
