/**
 * Stress test — Flow "Chạy toàn luồng" (Run Full Flow, E2E)
 *
 * Strategy:
 *   - Setup: lấy seed dossier ids + pre-link rule-template 1 lần
 *   - Default: POST run-full-flow + poll cho đến terminal
 *
 * ⚠️ ENDPOINT NẶNG NHẤT — gom wait_conversion + extract + validate.
 * 1 lần chạy E2E ~10-30s với data đầy đủ. Nhiều VU đồng thời → queue depth lớn.
 * Khuyến nghị MAX_VU rất thấp (5-20).
 *
 * Chạy:
 *   k6 run -e MAX_VU=5 tests/assessment/stress/chay-toan-luong.js
 *   k6 run -e MAX_VU=20 tests/assessment/stress/chay-toan-luong.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Counter } from 'k6/metrics';
import { SharedArray } from 'k6/data';

import { login, authParams } from '../../../lib/auth.js';
import { stages } from '../../../lib/stages.js';
import { buildSummary } from '../../../lib/report.js';
import { getAdminUser } from '../../../lib/assessment-helper.js';
import { DOSSIERS_URL, findSeedDossierIds } from '../../../lib/dossiers-helper.js';
import {
  runFullFlowUrl,
  rulesLinkUrl,
  pollJob,
  isFullFlowPreconditionFail,
} from '../../../lib/jobs-helper.js';
import { randomIntBetween } from '../../../lib/utils.js';

const users = new SharedArray('users', () =>
  JSON.parse(open('../../../data/seed/users.json'))
);

const enqueueTrend    = new Trend('fullflow_enqueue_duration', true);
const pollTrend       = new Trend('fullflow_poll_duration',    true);
const e2eTrend        = new Trend('fullflow_e2e_duration',     true);
const completedCnt    = new Counter('fullflow_completed');
const failedCnt       = new Counter('fullflow_failed');
const preconditionCnt = new Counter('fullflow_precondition_fail');
const timeoutCnt      = new Counter('fullflow_timeout');
const reusedCnt       = new Counter('fullflow_reused_existing');

export const options = {
  stages: stages.stress,
  thresholds: {
    checks: ['rate>0.85'],
    http_req_failed: ['rate<0.15'],
    'http_req_duration{name:fullflow_enqueue}': ['p(95)<5000'],
    'fullflow_e2e_duration':                    ['p(95)<240000'],   // 4 phút
  },
};

export function setup() {
  const admin = getAdminUser(users);
  const tokens = login(admin);
  if (!tokens.accessToken) throw new Error(`login failed for ${admin.username}`);
  const seedIds = findSeedDossierIds(tokens, 30);
  console.log(`setup: ${seedIds.length} seed dossiers, pre-linking rule-template...`);

  let linked = 0;
  for (const id of seedIds) {
    try {
      const detail = http.get(`${DOSSIERS_URL}/${id}`, authParams(tokens)).json();
      const data = detail?.data ?? detail ?? {};
      const tpl = (data.templates ?? [])[0];
      const rls = data.rules ?? [];
      if (!tpl || rls.length === 0) continue;

      for (const r of rls) {
        const res = http.post(rulesLinkUrl(id),
          JSON.stringify({ rule_id: r.id, target_template_ids: [tpl.id] }),
          authParams(tokens));
        if (res.status === 200) linked++;
      }
    } catch (_) { /* best-effort */ }
  }
  console.log(`setup: linked ${linked} pair across ${seedIds.length} dossiers`);
  return { tokens, seedIds };
}

export default function ({ tokens, seedIds }) {
  // Random dossier_id để giảm reused_existing (job lock theo dossier)
  const dossierId = seedIds[randomIntBetween(0, seedIds.length - 1)];
  const t0 = Date.now();

  // ── Enqueue ────────────────────────────────────────────────────────────
  const payload = JSON.stringify({
    use_agent_mode: false,
    wait_timeout_seconds: 300,
    poll_interval_seconds: 5,
  });

  const enqRes = http.post(runFullFlowUrl(dossierId), payload,
    authParams(tokens, { tags: { name: 'fullflow_enqueue' }, timeout: '30s' }));
  enqueueTrend.add(enqRes.timings.duration);

  const enqBody = (() => { try { return enqRes.json(); } catch (_) { return null; } })();

  check(enqRes, {
    'enqueue: 200': (r) => r.status === 200,
    'enqueue: có job id': () => typeof enqBody?.id === 'string',
    'enqueue: job_type=dossier.full_flow': () => enqBody?.job_type === 'dossier.full_flow',
  });

  if (enqRes.status !== 200 || !enqBody?.id) {
    sleep(randomIntBetween(3, 8));
    return;
  }
  if (enqBody.reused_existing === true) reusedCnt.add(1);

  // ── Poll ───────────────────────────────────────────────────────────────
  const pollResult = pollJob(tokens, enqBody.id, {
    timeoutMs: 240000,
    intervalMs: 3000,   // interval rộng cho stress
  });
  pollTrend.add(pollResult.elapsedMs);
  e2eTrend.add(Date.now() - t0);

  if (!pollResult.terminal) {
    timeoutCnt.add(1);
    return;
  }
  const finalJob = pollResult.job;
  if (finalJob.status === 'completed') {
    completedCnt.add(1);
    if (isFullFlowPreconditionFail(finalJob.result)) {
      preconditionCnt.add(1);
    } else {
      check(null, {
        'result: 3 steps tồn tại': () =>
          finalJob.result?.step_1_wait_conversion != null &&
          finalJob.result?.step_2_extraction != null &&
          finalJob.result?.step_3_validation != null,
        'result: success=true': () => finalJob.result?.success === true,
      });
    }
  } else if (finalJob.status === 'failed') {
    const msg = finalJob.error_message ?? '';
    if (typeof msg === 'string' && /no (pool|markdown|extracted|file)|empty|not ready|chưa có/i.test(msg)) {
      preconditionCnt.add(1);
    } else {
      failedCnt.add(1);
    }
  }

  sleep(randomIntBetween(2, 5));
}

export const handleSummary = buildSummary('assessment-chay-toan-luong-stress');
