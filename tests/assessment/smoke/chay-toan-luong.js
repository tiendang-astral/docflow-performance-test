/**
 * Smoke test — Flow "Chạy toàn luồng" (Run Full Flow, E2E)
 *
 * Flow đúng theo trace thật:
 *   1. GET  /v1/dossiers/{id}                 → templates + rules
 *   2. POST /v2/dossiers/{id}/rules/link      → link rule với template
 *   3. POST /v3/dossiers/{id}/run-full-flow   → JobResponse (job_type=dossier.full_flow)
 *   4. GET  /v3/jobs/{job_id}    (poll)       → đợi terminal status
 *   5. Validate result schema:
 *        - step_1_wait_conversion (files_count, ready_count)
 *        - step_2_extraction      (templates_processed, extraction_snapshots[].extracted_fields)
 *        - step_3_validation      (total_rules, executed, results[].status)
 *
 * Đây là endpoint NẶNG nhất — gom 3 bước (wait conversion + extract + validate) vào 1 job.
 * E2E thường mất 10-30s nếu data đầy đủ.
 *
 * Chạy: k6 run tests/assessment/smoke/chay-toan-luong.js
 */

import http from 'k6/http';
import { check, sleep, fail } from 'k6';
import { Trend, Counter } from 'k6/metrics';
import { SharedArray } from 'k6/data';

import { login, authParams } from '../../../lib/auth.js';
import { buildSummary } from '../../../lib/report.js';
import { getAdminUser } from '../../../lib/assessment-helper.js';
import { DOSSIERS_URL, findSeedDossierIds } from '../../../lib/dossiers-helper.js';
import {
  runFullFlowUrl,
  rulesLinkUrl,
  pollJob,
  validateFullFlowResult,
  isFullFlowPreconditionFail,
  summarizeFullFlowResult,
} from '../../../lib/jobs-helper.js';

const users = new SharedArray('users', () =>
  JSON.parse(open('../../../data/seed/users.json'))
);

const linkTrend       = new Trend('fullflow_link_duration',    true);
const enqueueTrend    = new Trend('fullflow_enqueue_duration', true);
const pollTrend       = new Trend('fullflow_poll_duration',    true);
const e2eTrend        = new Trend('fullflow_e2e_duration',     true);
const completedCnt    = new Counter('fullflow_completed');
const failedCnt       = new Counter('fullflow_failed');
const preconditionCnt = new Counter('fullflow_precondition_fail');
const timeoutCnt      = new Counter('fullflow_timeout');

export const options = {
  vus: 1,
  iterations: 1,
  duration: '300s',  // full flow nặng — wait + extract + validate có thể 30s+
  thresholds: {
    checks: ['rate>0.90'],
    'http_req_duration{name:fullflow_link}':    ['p(95)<2000'],
    'http_req_duration{name:fullflow_enqueue}': ['p(95)<3000'],
    'fullflow_e2e_duration':                    ['p(95)<120000'],
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

  // ── 1) GET dossier để có templates + rules ─────────────────────────────
  const detailRes = http.get(`${DOSSIERS_URL}/${dossierId}`,
    authParams(tokens, { tags: { name: 'dossier_detail' } }));
  if (detailRes.status !== 200) {
    fail(`detail HTTP ${detailRes.status}`);
  }
  const data = detailRes.json()?.data ?? detailRes.json() ?? {};
  const templates = data.templates ?? [];
  const rules = data.rules ?? [];
  check(null, {
    'detail: có templates[]': () => Array.isArray(templates),
    'detail: có rules[]':     () => Array.isArray(rules),
  });

  // ── 2) Link mọi rule với template đầu tiên (best-effort) ───────────────
  if (templates.length > 0 && rules.length > 0) {
    const tplId = templates[0].id;
    for (const r of rules) {
      const lr = http.post(rulesLinkUrl(dossierId),
        JSON.stringify({ rule_id: r.id, target_template_ids: [tplId] }),
        authParams(tokens, { tags: { name: 'fullflow_link' }, timeout: '15s' })
      );
      linkTrend.add(lr.timings.duration);
      check(lr, {
        'link: 200':          (rs) => rs.status === 200,
        'link: success=true': (rs) => rs.json('success') === true,
      });
    }
    console.log(`[link] ${rules.length} rule(s) → template ${tplId}`);
  }

  // ── 3) Enqueue run-full-flow ────────────────────────────────────────────
  const t0 = Date.now();
  const payload = JSON.stringify({
    use_agent_mode: false,
    wait_timeout_seconds: 300,
    poll_interval_seconds: 5,
  });

  const enqRes = http.post(runFullFlowUrl(dossierId), payload,
    authParams(tokens, { tags: { name: 'fullflow_enqueue' }, timeout: '30s' }));
  enqueueTrend.add(enqRes.timings.duration);

  const enqBody = (() => { try { return enqRes.json(); } catch (_) { return null; } })();

  const enqOk = check(enqRes, {
    'enqueue: 200': (r) => r.status === 200,
    'enqueue: có job id': () => typeof enqBody?.id === 'string',
    'enqueue: job_type=dossier.full_flow': () => enqBody?.job_type === 'dossier.full_flow',
    'enqueue: target_id khớp': () =>
      enqBody?.target_id === String(dossierId) || enqBody?.dossier_id === dossierId,
  });

  if (!enqOk || !enqBody?.id) {
    console.error(`[enqueue] HTTP ${enqRes.status}: ${(enqRes.body || '').slice(0, 300)}`);
    fail('enqueue failed');
  }
  console.log(`[enqueue] dossier=${dossierId} → job_id=${enqBody.id} (status=${enqBody.status})`);

  // ── 4) Poll cho đến terminal ────────────────────────────────────────────
  const pollResult = pollJob(tokens, enqBody.id, {
    timeoutMs: 240000,  // 4 phút — full flow có thể chạy lâu
    intervalMs: 2000,
  });
  pollTrend.add(pollResult.elapsedMs);
  e2eTrend.add(Date.now() - t0);

  check(pollResult, {
    'poll: terminal':    (p) => p.terminal === true,
    'poll: có job body': (p) => p.job != null,
  });

  if (!pollResult.terminal) {
    timeoutCnt.add(1);
    console.error(`[poll] timeout after ${pollResult.elapsedMs}ms, ${pollResult.polls} polls`);
    return;
  }
  const finalJob = pollResult.job;
  console.log(`[poll] status=${finalJob.status} (polled ${pollResult.polls}× in ${pollResult.elapsedMs}ms)`);

  // ── 5) Validate result schema ───────────────────────────────────────────
  if (finalJob.status === 'completed') {
    completedCnt.add(1);

    if (isFullFlowPreconditionFail(finalJob.result)) {
      preconditionCnt.add(1);
      check(null, {
        'precondition-fail: result tồn tại': () => finalJob.result != null,
      });
      console.log(`[ok-precondition] ${finalJob.result?.message || 'no pool files'}`);
    } else {
      const v = validateFullFlowResult(finalJob.result);
      check(null, {
        'result: schema hợp lệ':                         () => v.ok,
        'result: success=true':                           () => finalJob.result?.success === true,
        'result: step_1 (wait_conversion) tồn tại':       () => finalJob.result?.step_1_wait_conversion != null,
        'result: step_2 (extraction) tồn tại':            () => finalJob.result?.step_2_extraction != null,
        'result: step_3 (validation) tồn tại':            () => finalJob.result?.step_3_validation != null,
        'step_1: ready_count ≤ files_count':              () => {
          const s = finalJob.result?.step_1_wait_conversion;
          return s && s.ready_count <= s.files_count;
        },
        'step_2: templates_succeeded ≤ templates_processed': () => {
          const s = finalJob.result?.step_2_extraction;
          return s && s.templates_succeeded <= s.templates_processed;
        },
        'step_3: executed = passed+failed+errors+advisory': () => {
          const s = finalJob.result?.step_3_validation;
          return s && s.executed === (s.passed + s.failed + s.errors + s.advisory);
        },
      });

      if (!v.ok) {
        console.error(`[validate] errors:\n  - ${v.errors.slice(0, 10).join('\n  - ')}`);
        console.error(`[validate] result: ${JSON.stringify(finalJob.result).slice(0, 500)}`);
      } else {
        console.log(`[ok] ${summarizeFullFlowResult(finalJob.result)}`);
      }
    }
  } else if (finalJob.status === 'failed') {
    // Một số case fail là precondition (no pool/markdown)
    const msg = finalJob.error_message ?? '';
    if (typeof msg === 'string' && /no (pool|markdown|extracted|file)|empty|not ready|chưa có/i.test(msg)) {
      preconditionCnt.add(1);
      console.log(`[ok-precondition] (status=failed) ${msg}`);
    } else {
      failedCnt.add(1);
      console.error(`[job-failed] ${msg}`);
    }
  }

  sleep(2);
}

export const handleSummary = buildSummary('assessment-chay-toan-luong-smoke');
