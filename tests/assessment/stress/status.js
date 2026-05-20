/**
 * Stress test — GET /v1/assessment/{dossier_id}/status
 *
 * Chạy:
 *   k6 run tests/assessment/stress/status.js
 *   k6 run -e MAX_VU=20 tests/assessment/stress/status.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';

import { login, authParams } from '../../../lib/auth.js';
import { stages } from '../../../lib/stages.js';
import { buildSummary } from '../../../lib/report.js';
import { getAdminUser, statusUrl } from '../../../lib/assessment-helper.js';
import { findSeedDossierIds } from '../../../lib/dossiers-helper.js';
import { randomIntBetween } from '../../../lib/utils.js';

const users = new SharedArray('users', () =>
  JSON.parse(open('../../../data/seed/users.json'))
);

export const options = {
  stages: stages.stress,
  thresholds: {
    checks: ['rate>0.95'],
    http_req_failed: ['rate<0.05'],
    'http_req_duration{name:assessment_status}':    ['p(95)<2000'],
    'http_req_duration{name:assessment_not_found}': ['p(95)<800'],
  },
};

export function setup() {
  const admin = getAdminUser(users);
  const tokens = login(admin);
  if (!tokens.accessToken) throw new Error(`login failed for ${admin.username}`);
  const seedIds = findSeedDossierIds(tokens, 30);
  console.log(`setup: ${seedIds.length} dossier id sẵn sàng`);
  return { tokens, seedIds };
}

export default function ({ tokens, seedIds }) {
  const useInvalid = randomIntBetween(0, 9) === 0;  // 10% test 404 path
  if (useInvalid) {
    const res = http.get(statusUrl(999999999),
      authParams(tokens, { tags: { name: 'assessment_not_found' } }));
    check(res, {
      'not-found: 4xx': (r) => r.status >= 400 && r.status < 500,
    });
  } else {
    const id = seedIds[randomIntBetween(0, seedIds.length - 1)];
    const res = http.get(statusUrl(id),
      authParams(tokens, { tags: { name: 'assessment_status' } }));
    check(res, {
      'status: 200': (r) => r.status === 200,
    });
  }

  sleep(randomIntBetween(1, 2));
}

export const handleSummary = buildSummary('assessment-status-stress');
