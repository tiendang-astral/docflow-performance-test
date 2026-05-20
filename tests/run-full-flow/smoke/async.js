/**
 * Smoke test — POST /v3/dossiers/{id}/run-full-flow (async enqueue)
 *
 * Endpoint enqueue job rồi trả response NGAY (JobResponse) — không block.
 * Job thực sự chạy ở background queue.
 *
 * Verify response shape theo schema JobResponse:
 *   { id, job_type, job_key, target_type, target_id, queue_name, priority, status, payload, ... }
 *
 * Chạy: k6 run tests/run-full-flow/smoke/async.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';

import { login, authParams } from '../../../lib/auth.js';
import { buildSummary } from '../../../lib/report.js';
import {
  getAdminUser,
  runFullFlowAsyncUrl,
  validateJobResponse,
  isPreconditionFail,
} from '../../../lib/run-full-flow-helper.js';
import { findSeedDossierIds } from '../../../lib/dossiers-helper.js';

const users = new SharedArray('users', () =>
  JSON.parse(open('../../../data/seed/users.json'))
);

export const options = {
  vus: 1,
  iterations: 1,
  duration: '30s',
  thresholds: {
    checks: ['rate>0.95'],
    // Async enqueue — trả nhanh
    'http_req_duration{name:run_full_flow_async}': ['p(95)<3000'],
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

  // DossierJobRequest body — optional fields
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
      'schema: JobResponse hợp lệ':       () => v.ok,
      'schema: có job id':                 () => typeof body?.id === 'string' && body.id.length > 0,
      'schema: có status':                 () => typeof body?.status === 'string',
      'schema: target_type là string':     () => typeof body?.target_type === 'string',
      'schema: target_id khớp dossier_id': () => body?.target_id === String(id) || body?.dossier_id === id,
    });

    if (!v.ok) {
      console.error(`[validate] errors: ${v.errors.join(' | ')}`);
      console.error(`[validate] response: ${JSON.stringify(body).slice(0, 400)}`);
    } else {
      console.log(`[ok] dossier_id=${id} → job_id=${body.id} status=${body.status}`);
    }
  } else if (isPreconditionFail(res, body)) {
    console.log(`[ok-${res.status}] dossier_id=${id} precondition fail: ${body.detail || body.message}`);
  } else {
    console.error(`[async] HTTP ${res.status}: ${(res.body || '').slice(0, 300)}`);
  }

  sleep(1);
}

export const handleSummary = buildSummary('run-full-flow-async-smoke');
