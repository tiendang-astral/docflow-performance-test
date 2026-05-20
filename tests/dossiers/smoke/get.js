/**
 * Smoke test — GET /v1/dossiers/{id}
 *
 * Read-only → không có teardown.
 *
 * Chạy: k6 run tests/dossiers/smoke/get.js
 */

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { SharedArray } from 'k6/data';

import { login, authParams } from '../../../lib/auth.js';
import { buildSummary } from '../../../lib/report.js';
import {
  getAdminUser,
  findSeedDossierIds,
  DOSSIERS_URL,
} from '../../../lib/dossiers-helper.js';

const users = new SharedArray('users', () =>
  JSON.parse(open('../../../data/seed/users.json'))
);

export const options = {
  vus: 1,
  iterations: 1,
  duration: '10s',
  thresholds: {
    checks: ['rate>0.99'],
    'http_req_duration{name:dossiers_get}':       ['p(95)<800'],
    'http_req_duration{name:dossiers_not_found}': ['p(95)<500'],
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
  group('GET /v1/dossiers/{id}', () => {
    const id = seedIds[__ITER % seedIds.length];

    // Happy path
    {
      const res = http.get(`${DOSSIERS_URL}/${id}`,
        authParams(tokens, { tags: { name: 'dossiers_get' } }));
      check(res, {
        'get: 200': (r) => r.status === 200,
        'get: id matches':  (r) => (r.json('id') ?? r.json('data.id')) === id,
        'get: has templates[]': (r) =>
          Array.isArray(r.json('templates') ?? r.json('data.templates')),
        'get: has rules[]': (r) =>
          Array.isArray(r.json('rules') ?? r.json('data.rules')),
      });
    }

    // Negative
    {
      const res = http.get(`${DOSSIERS_URL}/999999999`,
        authParams(tokens, { tags: { name: 'dossiers_not_found' } }));
      check(res, {
        'not-found: 404': (r) => r.status === 404,
      });
    }
  });

  sleep(1);
}

export const handleSummary = buildSummary('dossiers-get-smoke');
