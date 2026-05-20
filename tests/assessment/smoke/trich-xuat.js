/**
 * Smoke test — Flow "Trích xuất dữ liệu" (E2E)
 *
 * Flow đúng theo trace thật:
 *   1. POST /v3/dossiers/{id}/extract/global   → JobResponse (status=queued)
 *   2. GET  /v3/jobs/{job_id}      (poll)      → đợi tới khi status=completed | failed
 *   3. Validate job.result schema (summary, extraction_snapshots, extracted_fields[])
 *
 * Metric tách bạch:
 *   - extract_enqueue_duration  : POST latency (ms)
 *   - extract_poll_duration     : tổng thời gian polling (ms)
 *   - extract_e2e_duration      : enqueue + poll (ms)
 *
 * Chạy: k6 run tests/assessment/smoke/trich-xuat.js
 */

import http from 'k6/http';
import { check, sleep, fail } from 'k6';
import { Trend, Counter } from 'k6/metrics';
import { SharedArray } from 'k6/data';

import { login, authParams } from '../../../lib/auth.js';
import { buildSummary } from '../../../lib/report.js';
import { getAdminUser } from '../../../lib/assessment-helper.js';
import { findSeedDossierIds } from '../../../lib/dossiers-helper.js';
import {
  extractGlobalUrl,
  pollJob,
  validateExtractResult,
  isExtractPreconditionFail,
  summarizeExtractResult,
} from '../../../lib/jobs-helper.js';

const users = new SharedArray('users', () =>
  JSON.parse(open('../../../data/seed/users.json'))
);

const enqueueTrend = new Trend('extract_enqueue_duration', true);
const pollTrend    = new Trend('extract_poll_duration',    true);
const e2eTrend     = new Trend('extract_e2e_duration',     true);
const completedCnt    = new Counter('extract_completed');
const failedCnt       = new Counter('extract_failed');
const preconditionCnt = new Counter('extract_precondition_fail');
const timeoutCnt      = new Counter('extract_timeout');

export const options = {
  vus: 1,
  iterations: 1,
  duration: '180s',  // extract job có thể mất nhiều giây nếu data nặng
  thresholds: {
    checks: ['rate>0.90'],
    'http_req_duration{name:extract_enqueue}': ['p(95)<3000'],
    'extract_e2e_duration':                    ['p(95)<60000'],
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
  const dossierId = seedIds[__ITER % seedIds.length];
  const t0 = Date.now();

  // ── 1) Enqueue ─────────────────────────────────────────────────────────
  const payload = JSON.stringify({
    use_agent_mode: false,
    wait_timeout_seconds: 300,
    poll_interval_seconds: 5,
  });

  const enqRes = http.post(extractGlobalUrl(dossierId), payload,
    authParams(tokens, { tags: { name: 'extract_enqueue' }, timeout: '30s' }));
  enqueueTrend.add(enqRes.timings.duration);

  const enqBody = (() => { try { return enqRes.json(); } catch (_) { return null; } })();

  const enqOk = check(enqRes, {
    'enqueue: 200': (r) => r.status === 200,
    'enqueue: có job id': () => typeof enqBody?.id === 'string' && enqBody.id.length > 0,
    'enqueue: status=queued|running': () =>
      enqBody?.status === 'queued' || enqBody?.status === 'running',
    'enqueue: target_id khớp dossier_id': () =>
      enqBody?.target_id === String(dossierId) || enqBody?.dossier_id === dossierId,
  });

  if (!enqOk || !enqBody?.id) {
    console.error(`[enqueue] dossier=${dossierId} HTTP ${enqRes.status}: ${(enqRes.body || '').slice(0, 300)}`);
    fail('enqueue failed — skip polling');
  }

  console.log(`[enqueue] dossier=${dossierId} → job_id=${enqBody.id} (status=${enqBody.status})`);

  // ── 2) Poll ────────────────────────────────────────────────────────────
  const pollResult = pollJob(tokens, enqBody.id, {
    timeoutMs: 120000,   // 2 phút cho 1 job
    intervalMs: 1000,    // poll mỗi giây
  });
  pollTrend.add(pollResult.elapsedMs);
  e2eTrend.add(Date.now() - t0);

  check(pollResult, {
    'poll: terminal (completed/failed/cancelled)': (p) => p.terminal === true,
    'poll: có job body': (p) => p.job != null,
  });

  if (!pollResult.terminal) {
    timeoutCnt.add(1);
    console.error(`[poll] timeout after ${pollResult.elapsedMs}ms, ${pollResult.polls} polls, last status=${pollResult.job?.status}`);
    return;
  }

  const finalJob = pollResult.job;
  console.log(`[poll] job_id=${enqBody.id} → status=${finalJob.status} (polled ${pollResult.polls}× in ${pollResult.elapsedMs}ms)`);

  // ── 3) Validate ────────────────────────────────────────────────────────
  if (finalJob.status === 'completed') {
    completedCnt.add(1);

    // Precondition fail (vd seed dossier chưa có pool markdown) → endpoint healthy,
    // chỉ assert job lifecycle hoạt động + message rõ ràng. Skip schema sâu.
    if (isExtractPreconditionFail(finalJob.result)) {
      preconditionCnt.add(1);
      check(null, {
        'precondition-fail: success=false':    () => finalJob.result.success === false,
        'precondition-fail: có message rõ':    () =>
          typeof finalJob.result.message === 'string' && finalJob.result.message.length > 0,
        'precondition-fail: arrays vẫn hợp lệ': () =>
          Array.isArray(finalJob.result.summary) && Array.isArray(finalJob.result.extraction_snapshots),
      });
      console.log(`[ok-precondition] ${finalJob.result.message}`);
    } else {
      // Full success → validate schema chi tiết
      const v = validateExtractResult(finalJob.result);
      check(null, {
        'result: schema hợp lệ':              () => v.ok,
        'result: success=true':                () => finalJob.result?.success === true,
        'result: templates_processed > 0':     () => finalJob.result?.templates_processed > 0,
        'result: có ≥1 extraction_snapshot':   () =>
          Array.isArray(finalJob.result?.extraction_snapshots) && finalJob.result.extraction_snapshots.length >= 1,
        'result: mỗi snapshot có extracted_fields[]': () =>
          finalJob.result?.extraction_snapshots?.every((s) =>
            Array.isArray(s.extracted_fields) && s.extracted_fields.length >= 1),
        'result: mọi extracted_field có confidence_score': () =>
          finalJob.result?.extraction_snapshots?.every((s) =>
            s.extracted_fields?.every((f) => typeof f.confidence_score === 'number')),
      });

      if (!v.ok) {
        console.error(`[validate] errors:\n  - ${v.errors.join('\n  - ')}`);
        console.error(`[validate] result: ${JSON.stringify(finalJob.result).slice(0, 600)}`);
      } else {
        console.log(`[ok] ${summarizeExtractResult(finalJob.result)}`);
      }
    }
  } else if (finalJob.status === 'failed') {
    failedCnt.add(1);
    console.error(`[job-failed] error_message: ${finalJob.error_message}`);
    // Vẫn check: endpoint alive + job lifecycle hoạt động
    check(null, {
      'failed job: có error_message': () =>
        typeof finalJob.error_message === 'string' && finalJob.error_message.length > 0,
    });
  } else {
    console.log(`[terminal-other] status=${finalJob.status}`);
  }

  sleep(2);
}

export const handleSummary = buildSummary('assessment-trich-xuat-smoke');
