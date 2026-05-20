/**
 * Stress test — Flow "Trích xuất dữ liệu" (E2E qua async job)
 *
 * Mỗi iteration:
 *   1. POST /v3/dossiers/{id}/extract/global   → JobResponse
 *   2. Poll /v3/jobs/{id} cho đến terminal status (hoặc timeout)
 *
 * Đo 2 metric chính:
 *   - extract_enqueue_duration : latency của POST (đo enqueue throughput)
 *   - extract_e2e_duration     : tổng enqueue + poll (đo worker capacity dưới tải)
 *
 * ⚠️ Lưu ý:
 *   - Endpoint nặng (chạy LLM extraction) → MAX_VU thấp (10-50)
 *   - Trace thực tế cho thấy `reused_existing` flag: enqueue trùng dossier_id đang xử lý
 *     sẽ reuse job hiện có (không tạo job mới). → Đa dạng dossier_id để stress thật.
 *
 * Chạy:
 *   k6 run -e MAX_VU=10 tests/assessment/stress/trich-xuat.js
 *   k6 run -e MAX_VU=30 tests/assessment/stress/trich-xuat.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Counter } from 'k6/metrics';
import { SharedArray } from 'k6/data';

import { login, authParams } from '../../../lib/auth.js';
import { stages } from '../../../lib/stages.js';
import { buildSummary } from '../../../lib/report.js';
import { getAdminUser } from '../../../lib/assessment-helper.js';
import { findSeedDossierIds } from '../../../lib/dossiers-helper.js';
import {
  extractGlobalUrl,
  pollJob,
  isExtractPreconditionFail,
} from '../../../lib/jobs-helper.js';
import { randomIntBetween } from '../../../lib/utils.js';

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
const reusedCnt       = new Counter('extract_reused_existing');

export const options = {
  stages: stages.stress,
  thresholds: {
    checks: ['rate>0.85'],
    http_req_failed: ['rate<0.15'],
    'http_req_duration{name:extract_enqueue}': ['p(95)<5000'],
    'extract_e2e_duration':                    ['p(95)<120000'],
  },
};

export function setup() {
  const admin = getAdminUser(users);
  const tokens = login(admin);
  if (!tokens.accessToken) throw new Error(`login failed for ${admin.username}`);
  const seedIds = findSeedDossierIds(tokens, 30);
  console.log(`setup: ${seedIds.length} dossier id sẵn sàng`);
  return { tokens, seedIds };
}

export default function ({ tokens, seedIds }) {
  // Random dossier để hạn chế reused_existing
  const dossierId = seedIds[randomIntBetween(0, seedIds.length - 1)];
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

  check(enqRes, {
    'enqueue: 200': (r) => r.status === 200,
    'enqueue: có job id': () => typeof enqBody?.id === 'string',
  });

  if (enqRes.status !== 200 || !enqBody?.id) {
    sleep(randomIntBetween(2, 5));
    return;
  }
  if (enqBody.reused_existing === true) {
    reusedCnt.add(1);
  }

  // ── 2) Poll ────────────────────────────────────────────────────────────
  // Interval rộng hơn smoke (2s) để giảm tải GET dưới high concurrency
  const pollResult = pollJob(tokens, enqBody.id, {
    timeoutMs: 180000,   // 3 phút
    intervalMs: 2000,
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
    // Chấp nhận precondition-fail (vd no markdown) là healthy — endpoint + job lifecycle OK
    if (isExtractPreconditionFail(finalJob.result)) {
      preconditionCnt.add(1);
      check(null, {
        'result: precondition-fail hợp lệ': () =>
          finalJob.result?.success === false && typeof finalJob.result?.message === 'string',
      });
    } else {
      check(null, {
        'result: success=true':            () => finalJob.result?.success === true,
        'result: templates_processed > 0': () => finalJob.result?.templates_processed > 0,
      });
    }
  } else if (finalJob.status === 'failed') {
    failedCnt.add(1);
  }

  sleep(randomIntBetween(1, 3));
}

export const handleSummary = buildSummary('assessment-trich-xuat-stress');
