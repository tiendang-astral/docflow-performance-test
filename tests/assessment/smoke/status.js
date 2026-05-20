/**
 * Smoke test — GET /v1/assessment/{dossier_id}/status
 *
 * Read-only → không có teardown.
 * Lấy 1 seed dossier id, GET status, verify shape.
 *
 * Chạy: k6 run tests/assessment/smoke/status.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';

import { login, authParams } from '../../../lib/auth.js';
import { buildSummary } from '../../../lib/report.js';
import { getAdminUser, statusUrl } from '../../../lib/assessment-helper.js';
import { findSeedDossierIds } from '../../../lib/dossiers-helper.js';

const users = new SharedArray('users', () =>
  JSON.parse(open('../../../data/seed/users.json'))
);

export const options = {
  vus: 1,
  iterations: 1,
  duration: '10s',
  thresholds: {
    checks: ['rate>0.99'],
    'http_req_duration{name:assessment_status}':       ['p(95)<800'],
    'http_req_duration{name:assessment_not_found}':    ['p(95)<500'],
  },
};

export function setup() {
  const admin = getAdminUser(users);
  const tokens = login(admin);
  if (!tokens.accessToken) throw new Error(`login failed for ${admin.username}`);
  const seedIds = findSeedDossierIds(tokens, 10);
  console.log(`setup: ${seedIds.length} seed dossiers → ${seedIds.slice(0, 5).join(',')}…`);
  return { tokens, seedIds };
}

export default function ({ tokens, seedIds }) {
  // Happy path
  {
    const id = seedIds[__ITER % seedIds.length];
    const res = http.get(statusUrl(id),
      authParams(tokens, { tags: { name: 'assessment_status' } }));
    check(res, {
      'status: 200': (r) => r.status === 200,
      'status: response is object': (r) => {
        try { return typeof r.json() === 'object'; } catch (_) { return false; }
      },
    });
  }

  // Negative: dossier không tồn tại
  {
    const res = http.get(statusUrl(999999999),
      authParams(tokens, { tags: { name: 'assessment_not_found' } }));
    check(res, {
      'not-found: 404 or 4xx': (r) => r.status === 404 || (r.status >= 400 && r.status < 500),
    });
  }

  sleep(1);
}

export const handleSummary = buildSummary('assessment-status-smoke');
