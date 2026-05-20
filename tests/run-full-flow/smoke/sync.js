/**
 * Smoke test — POST /v2/dossiers/{id}/run-full-flow (synchronous)
 *
 * Endpoint chạy:
 *   1. Wait pool files conversion
 *   2. Run extraction
 *   3. Run validation
 *
 * KHÔNG persist entity mới → không cần teardown.
 *
 * Precondition: dossier phải có pool files. Seed dossiers chưa có → smoke chấp
 * nhận response 4xx với detail "no pool files / not ready" là healthy
 * (endpoint alive, chỉ thiếu data input).
 *
 * Chạy: k6 run tests/run-full-flow/smoke/sync.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';

import { login, authParams } from '../../../lib/auth.js';
import { buildSummary } from '../../../lib/report.js';
import {
  getAdminUser,
  runFullFlowSyncUrl,
  isPreconditionFail,
} from '../../../lib/run-full-flow-helper.js';
import { findSeedDossierIds } from '../../../lib/dossiers-helper.js';

const users = new SharedArray('users', () =>
  JSON.parse(open('../../../data/seed/users.json'))
);

export const options = {
  vus: 1,
  iterations: 1,
  duration: '300s',  // sync version có thể block lâu khi dossier có data thật
  thresholds: {
    checks: ['rate>0.95'],
    // 5 phút timeout — full flow gồm wait + extract + validate
    'http_req_duration{name:run_full_flow_sync}': ['p(95)<300000'],
  },
};

export function setup() {
  const admin = getAdminUser(users);
  const tokens = login(admin);
  if (!tokens.accessToken) throw new Error(`login failed for ${admin.username}`);
  const seedIds = findSeedDossierIds(tokens, 10);
  console.log(`setup: ${seedIds.length} seed dossiers`);
  return { tokens, seedIds };
}

export default function ({ tokens, seedIds }) {
  const id = seedIds[__ITER % seedIds.length];

  const res = http.post(runFullFlowSyncUrl(id), null,
    authParams(tokens, { tags: { name: 'run_full_flow_sync' }, timeout: '300s' }));

  const body = (() => { try { return res.json(); } catch (_) { return null; } })();

  check(res, {
    'sync: 200 hoặc precondition-fail':
      (r) => r.status === 200 || isPreconditionFail(r, body),
  });

  if (res.status === 200) {
    check(null, {
      'response: là object': () => body && typeof body === 'object',
    });
    console.log(`[ok-200] dossier_id=${id} full flow completed`);
  } else if (isPreconditionFail(res, body)) {
    console.log(`[ok-${res.status}] dossier_id=${id} precondition fail: ${body.detail || body.message}`);
  } else {
    console.error(`[sync] HTTP ${res.status}: ${(res.body || '').slice(0, 300)}`);
  }

  sleep(2);
}

export const handleSummary = buildSummary('run-full-flow-sync-smoke');
