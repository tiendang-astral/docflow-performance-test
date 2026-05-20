/**
 * Smoke test — PUT /v1/dossiers/{id}
 *
 * Strategy:
 *   - setup() lấy 1 seed dossier, snapshot (name/description/tags/status)
 *   - Mỗi iteration PUT giá trị mới
 *   - teardown() restore lại snapshot
 *
 * Chạy: k6 run tests/dossiers/smoke/update.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';

import { login, authParams } from '../../../lib/auth.js';
import { buildSummary } from '../../../lib/report.js';
import {
  getAdminUser,
  findSeedDossierIds,
  snapshotDossier,
  restoreDossier,
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
    'http_req_duration{name:dossiers_update}': ['p(95)<1000'],
  },
};

export function setup() {
  const admin = getAdminUser(users);
  const tokens = login(admin);
  if (!tokens.accessToken) throw new Error(`login failed for ${admin.username}`);

  const seedIds = findSeedDossierIds(tokens, 10);
  const targetId = seedIds[0];
  const snapshot = snapshotDossier(tokens, targetId);
  console.log(`setup: target=${targetId} ("${snapshot.name}") — sẽ restore ở teardown`);

  return { tokens, targetId, snapshot };
}

export default function ({ tokens, targetId }) {
  const payload = JSON.stringify({
    name: `[smoke-update] ${__VU}-${__ITER}-${Date.now()}`,
    description: 'Bị overwrite bởi smoke test',
    tags: ['_smoke_update'],
    status: 'draft',
  });

  const res = http.put(`${DOSSIERS_URL}/${targetId}`, payload,
    authParams(tokens, { tags: { name: 'dossiers_update' } }));

  check(res, {
    'update: 200': (r) => r.status === 200,
    'update: name reflected': (r) => {
      const n = r.json('name') ?? r.json('data.name');
      return typeof n === 'string' && n.startsWith('[smoke-update]');
    },
  });

  sleep(1);
}

export function teardown({ tokens, snapshot }) {
  console.log(`teardown: restore dossier ${snapshot.id} ← "${snapshot.name}"`);
  const res = restoreDossier(tokens, snapshot);
  if (res.status !== 200) {
    console.error(`teardown: restore failed HTTP ${res.status}: ${(res.body || '').slice(0, 200)}`);
  } else {
    console.log(`teardown: restore OK`);
  }
}

export const handleSummary = buildSummary('dossiers-update-smoke');
