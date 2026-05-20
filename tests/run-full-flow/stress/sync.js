/**
 * Stress test — POST /v2/dossiers/{id}/run-full-flow (synchronous)
 *
 * ⚠️ Endpoint block đến khi full flow hoàn tất. Với many VUs đồng thời:
 *   - Mỗi VU giữ connection lâu (vài chục giây → vài phút)
 *   - LLM rate limit dễ vướng
 *   - Resource server (DB connection pool, worker thread) dễ cạn
 *
 * Khuyến nghị MAX_VU rất thấp (3-10). Cho production load test → dùng async (v3) thay.
 *
 * Chạy:
 *   k6 run -e MAX_VU=5 tests/run-full-flow/stress/sync.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';

import { login, authParams } from '../../../lib/auth.js';
import { stages } from '../../../lib/stages.js';
import { buildSummary } from '../../../lib/report.js';
import {
  getAdminUser,
  runFullFlowSyncUrl,
  isPreconditionFail,
} from '../../../lib/run-full-flow-helper.js';
import { findSeedDossierIds } from '../../../lib/dossiers-helper.js';
import { randomIntBetween } from '../../../lib/utils.js';

const users = new SharedArray('users', () =>
  JSON.parse(open('../../../data/seed/users.json'))
);

export const options = {
  stages: stages.stress,
  thresholds: {
    checks: ['rate>0.85'],            // sync endpoint dễ timeout/flaky
    http_req_failed: ['rate<0.15'],
    'http_req_duration{name:run_full_flow_sync}': ['p(95)<300000'],
  },
};

export function setup() {
  const admin = getAdminUser(users);
  const tokens = login(admin);
  if (!tokens.accessToken) throw new Error(`login failed for ${admin.username}`);
  const seedIds = findSeedDossierIds(tokens, 30);
  console.log(`setup: ${seedIds.length} seed dossiers`);
  return { tokens, seedIds };
}

export default function ({ tokens, seedIds }) {
  const id = seedIds[randomIntBetween(0, seedIds.length - 1)];

  const res = http.post(runFullFlowSyncUrl(id), null,
    authParams(tokens, { tags: { name: 'run_full_flow_sync' }, timeout: '300s' }));

  const body = (() => { try { return res.json(); } catch (_) { return null; } })();

  check(res, {
    'sync: 200 hoặc precondition-fail':
      (r) => r.status === 200 || isPreconditionFail(r, body),
  });

  if (res.status !== 200 && !isPreconditionFail(res, body)) {
    console.error(`[sync] dossier=${id} HTTP ${res.status}: ${(res.body || '').slice(0, 200)}`);
  }

  sleep(randomIntBetween(3, 8));  // giãn cách vì endpoint block lâu
}

export const handleSummary = buildSummary('run-full-flow-sync-stress');
