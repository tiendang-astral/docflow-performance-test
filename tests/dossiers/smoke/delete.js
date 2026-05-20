/**
 * Smoke test — DELETE /v1/dossiers/{id}
 *
 * Strategy: KHÔNG xóa seed dossier. setup() tạo trước N "doomed" dossier,
 * mỗi iteration xóa 1. teardown() dọn nốt.
 *
 * Chạy: k6 run tests/dossiers/smoke/delete.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';

import { login, authParams } from '../../../lib/auth.js';
import { buildSummary } from '../../../lib/report.js';
import {
  getAdminUser,
  createDossier,
  deleteDossier,
  SAMPLE_DOSSIER,
  DOSSIERS_URL,
} from '../../../lib/dossiers-helper.js';

const users = new SharedArray('users', () =>
  JSON.parse(open('../../../data/seed/users.json'))
);

const DOOMED_COUNT = 30;

export const options = {
  vus: 1,
  iterations: 1,
  duration: '10s',
  thresholds: {
    checks: ['rate>0.99'],
    'http_req_duration{name:dossiers_delete}':       ['p(95)<1500'],
    'http_req_duration{name:dossiers_verify_gone}':  ['p(95)<500'],
  },
};

export function setup() {
  const admin = getAdminUser(users);
  const tokens = login(admin);
  if (!tokens.accessToken) throw new Error(`login failed for ${admin.username}`);

  const runId = `_smoke_doomed_dossier_${Date.now()}`;
  console.log(`setup: creating ${DOOMED_COUNT} doomed dossiers (${runId})...`);
  const doomedIds = [];
  for (let i = 0; i < DOOMED_COUNT; i++) {
    try {
      const id = createDossier(tokens, {
        name: `${runId}_${i}`,
        ...SAMPLE_DOSSIER,
        tags: ['_smoke', runId],
      });
      if (id != null) doomedIds.push(id);
    } catch (e) {
      console.error(`setup: tạo doomed #${i} thất bại: ${e.message}`);
    }
  }
  console.log(`setup: tạo được ${doomedIds.length} doomed dossiers`);
  return { tokens, doomedIds };
}

export default function ({ tokens, doomedIds }) {
  const idx = __ITER;
  if (idx >= doomedIds.length) {
    sleep(1);
    return;
  }
  const id = doomedIds[idx];

  const del = http.del(`${DOSSIERS_URL}/${id}`, null,
    authParams(tokens, { tags: { name: 'dossiers_delete' } }));
  check(del, {
    'delete: 200': (r) => r.status === 200,
  });

  const get = http.get(`${DOSSIERS_URL}/${id}`,
    authParams(tokens, { tags: { name: 'dossiers_verify_gone' } }));
  check(get, {
    'verify: 404': (r) => r.status === 404,
  });

  sleep(1);
}

export function teardown({ tokens, doomedIds }) {
  console.log(`teardown: cleanup doomed dossiers còn sót...`);
  let cleaned = 0;
  for (const id of doomedIds) {
    const d = deleteDossier(tokens, id);
    if (d.status === 200) cleaned++;
  }
  console.log(`teardown: cleaned=${cleaned}`);
}

export const handleSummary = buildSummary('dossiers-delete-smoke');
