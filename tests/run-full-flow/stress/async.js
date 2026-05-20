/**
 * Stress test — POST /v3/dossiers/{id}/run-full-flow (async enqueue)
 *
 * Endpoint enqueue job + trả ngay → có thể scale VU lên cao để đo throughput
 * của queue, không bị bottleneck bởi thời gian xử lý.
 *
 * Verify response shape JobResponse cho mỗi enqueue thành công.
 *
 * Chạy:
 *   k6 run tests/run-full-flow/stress/async.js
 *   k6 run -e MAX_VU=20 tests/run-full-flow/stress/async.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';

import { login, authParams } from '../../../lib/auth.js';
import { stages } from '../../../lib/stages.js';
import { buildSummary } from '../../../lib/report.js';
import {
  getAdminUser,
  runFullFlowAsyncUrl,
  validateJobResponse,
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
    checks: ['rate>0.95'],
    http_req_failed: ['rate<0.05'],
    'http_req_duration{name:run_full_flow_async}': ['p(95)<5000'],
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

  const payload = JSON.stringify({
    use_agent_mode: false,
    wait_timeout_seconds: 300,
    poll_interval_seconds: 5,
  });

  const res = http.post(runFullFlowAsyncUrl(id), payload,
    authParams(tokens, { tags: { name: 'run_full_flow_async' }, timeout: '30s' }));

  const body = (() => { try { return res.json(); } catch (_) { return null; } })();

  const httpOk = check(res, {
    'async: 200 hoặc precondition-fail':
      (r) => r.status === 200 || isPreconditionFail(r, body),
  });

  if (res.status === 200) {
    const v = validateJobResponse(body);
    check(null, {
      'schema: JobResponse hợp lệ': () => v.ok,
      'schema: có job id + status': () =>
        typeof body?.id === 'string' && typeof body?.status === 'string',
    });
    if (!v.ok) {
      console.error(`[validate] errors: ${v.errors.slice(0, 3).join(' | ')}`);
    }
  } else if (!isPreconditionFail(res, body)) {
    console.error(`[async] dossier=${id} HTTP ${res.status}: ${(res.body || '').slice(0, 200)}`);
  }

  sleep(randomIntBetween(1, 3));
}

export const handleSummary = buildSummary('run-full-flow-async-stress');
