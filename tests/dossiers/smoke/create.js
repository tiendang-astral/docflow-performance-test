/**
 * Smoke test — POST /v1/dossiers
 *
 * Mỗi iteration tạo 1 dossier với name unique. Teardown search theo name và xóa.
 *
 * Chạy: k6 run tests/dossiers/smoke/create.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';

import { login, authParams } from '../../../lib/auth.js';
import { buildSummary } from '../../../lib/report.js';
import {
  getAdminUser,
  deleteDossier,
  pickId,
  SAMPLE_DOSSIER,
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
    'http_req_duration{name:dossiers_create}': ['p(95)<1500'],
  },
};

export function setup() {
  const admin = getAdminUser(users);
  const tokens = login(admin);
  if (!tokens.accessToken) throw new Error(`login failed for ${admin.username}`);

  const runId = `_smoke_create_dossier_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  console.log(`setup: runId = ${runId}`);
  return { tokens, runId };
}

export default function ({ tokens, runId }) {
  const payload = JSON.stringify({
    name: `${runId}_${__VU}_${__ITER}`,
    ...SAMPLE_DOSSIER,
    tags: ['_smoke', runId],
  });

  const res = http.post(DOSSIERS_URL, payload,
    authParams(tokens, { tags: { name: 'dossiers_create' } }));

  check(res, {
    'create: 200/201': (r) => r.status === 200 || r.status === 201,
    'create: has id':  (r) => pickId(r) != null,
  });

  sleep(1);
}

export function teardown({ tokens, runId }) {
  console.log(`teardown: cleanup dossiers với name chứa "${runId}"`);
  const listRes = http.get(
    `${DOSSIERS_URL}?search=${encodeURIComponent(runId)}&size=100`,
    authParams(tokens)
  );
  if (listRes.status !== 200) {
    console.error(`teardown: list failed HTTP ${listRes.status}`);
    return;
  }
  const items = listRes.json('items') ?? listRes.json('data') ?? [];
  console.log(`teardown: found ${items.length} dossier(s) cần xóa`);

  let deleted = 0;
  let failed = 0;
  for (const d of items) {
    if (d?.id == null) continue;
    const r = deleteDossier(tokens, d.id);
    if (r.status === 200) deleted++; else failed++;
  }
  console.log(`teardown: deleted=${deleted} failed=${failed}`);
}

export const handleSummary = buildSummary('dossiers-create-smoke');
