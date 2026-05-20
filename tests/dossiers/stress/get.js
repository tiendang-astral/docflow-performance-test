/**
 * Stress test — GET /v1/dossiers/{id}
 *
 * Chạy:
 *   k6 run tests/dossiers/stress/get.js
 *   k6 run -e MAX_VU=20 tests/dossiers/stress/get.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';

import { login, authParams } from '../../../lib/auth.js';
import { stages } from '../../../lib/stages.js';
import { buildSummary } from '../../../lib/report.js';
import {
  getAdminUser,
  findSeedDossierIds,
  DOSSIERS_URL,
} from '../../../lib/dossiers-helper.js';
import { randomIntBetween } from '../../../lib/utils.js';

const users = new SharedArray('users', () =>
  JSON.parse(open('../../../data/seed/users.json'))
);

export const options = {
  stages: stages.stress,
  thresholds: {
    checks: ['rate>0.95'],
    http_req_failed: ['rate<0.05'],
    'http_req_duration{name:dossiers_get}':       ['p(95)<2000'],
    'http_req_duration{name:dossiers_not_found}': ['p(95)<800'],
  },
};

export function setup() {
  const admin = getAdminUser(users);
  const tokens = login(admin);
  if (!tokens.accessToken) throw new Error(`login failed for ${admin.username}`);
  const seedIds = findSeedDossierIds(tokens, 30);
  console.log(`setup: ${seedIds.length} dossier id sẵn sàng cho GET stress`);
  return { tokens, seedIds };
}

export default function ({ tokens, seedIds }) {
  const useInvalid = randomIntBetween(0, 9) === 0;
  if (useInvalid) {
    const res = http.get(`${DOSSIERS_URL}/999999999`,
      authParams(tokens, { tags: { name: 'dossiers_not_found' } }));
    check(res, { 'not-found: 404': (r) => r.status === 404 });
  } else {
    const id = seedIds[randomIntBetween(0, seedIds.length - 1)];
    const res = http.get(`${DOSSIERS_URL}/${id}`,
      authParams(tokens, { tags: { name: 'dossiers_get' } }));
    check(res, {
      'get: 200':        (r) => r.status === 200,
      'get: id matches': (r) => (r.json('id') ?? r.json('data.id')) === id,
    });
  }

  sleep(randomIntBetween(1, 2));
}

export const handleSummary = buildSummary('dossiers-get-stress');
