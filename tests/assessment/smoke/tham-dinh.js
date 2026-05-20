/**
 * Smoke test — Flow "Thẩm định" (Validate dossier, E2E)
 *
 * Flow đúng theo trace thật:
 *   1. GET  /v1/dossiers/{id}         → lấy templates + rules để link
 *   2. POST /v2/dossiers/{id}/rules/link  → link rule với template (cho mỗi cặp)
 *   3. POST /v3/dossiers/{id}/validate    → JobResponse (status=queued)
 *   4. GET  /v3/jobs/{job_id}     (poll)  → đợi terminal status
 *   5. Validate result schema (results[], passed/failed/errors/advisory counts)
 *
 * Metrics riêng:
 *   - validate_link_duration   : POST /rules/link latency
 *   - validate_enqueue_duration: POST /v3/validate latency
 *   - validate_poll_duration   : tổng polling time
 *   - validate_e2e_duration    : enqueue + poll
 *
 * Chạy: k6 run tests/assessment/smoke/tham-dinh.js
 */

import http from 'k6/http';
import { check, sleep, fail } from 'k6';
import { Trend, Counter } from 'k6/metrics';
import { SharedArray } from 'k6/data';

import { login, authParams } from '../../../lib/auth.js';
import { buildSummary } from '../../../lib/report.js';
import { getAdminUser } from '../../../lib/assessment-helper.js';
import { DOSSIERS_URL } from '../../../lib/dossiers-helper.js';
import { findSeedDossierIds } from '../../../lib/dossiers-helper.js';
import {
  validateEnqueueUrl,
  rulesLinkUrl,
  pollJob,
  validateValidateResult,
  isValidatePreconditionFail,
  isValidatePreconditionFailFromError,
  summarizeValidateResult,
} from '../../../lib/jobs-helper.js';

const users = new SharedArray('users', () =>
  JSON.parse(open('../../../data/seed/users.json'))
);

const linkTrend     = new Trend('validate_link_duration',    true);
const enqueueTrend  = new Trend('validate_enqueue_duration', true);
const pollTrend     = new Trend('validate_poll_duration',    true);
const e2eTrend      = new Trend('validate_e2e_duration',     true);
const completedCnt  = new Counter('validate_completed');
const failedCnt     = new Counter('validate_failed');
const preconditionCnt = new Counter('validate_precondition_fail');
const timeoutCnt    = new Counter('validate_timeout');

export const options = {
  vus: 1,
  iterations: 1,
  duration: '180s',
  thresholds: {
    checks: ['rate>0.90'],
    'http_req_duration{name:validate_link}':    ['p(95)<2000'],
    'http_req_duration{name:validate_enqueue}': ['p(95)<3000'],
    'validate_e2e_duration':                    ['p(95)<60000'],
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

  // ── 1) GET dossier để lấy templates + rules ────────────────────────────
  const detailRes = http.get(`${DOSSIERS_URL}/${dossierId}`,
    authParams(tokens, { tags: { name: 'dossier_detail' } }));
  if (detailRes.status !== 200) {
    console.error(`[detail] HTTP ${detailRes.status}: ${(detailRes.body || '').slice(0, 200)}`);
    fail('không lấy được dossier detail — skip');
  }
  const detail = detailRes.json();
  const data = detail?.data ?? detail ?? {};
  const templates = data.templates ?? [];
  const rules = data.rules ?? [];

  check(null, {
    'detail: có templates[]': () => Array.isArray(templates),
    'detail: có rules[]':     () => Array.isArray(rules),
  });

  // ── 2) Link mỗi rule với template đầu tiên (best-effort) ────────────────
  if (templates.length > 0 && rules.length > 0) {
    const targetTemplateId = templates[0].id;
    for (const r of rules) {
      const linkRes = http.post(rulesLinkUrl(dossierId),
        JSON.stringify({ rule_id: r.id, target_template_ids: [targetTemplateId] }),
        authParams(tokens, { tags: { name: 'validate_link' }, timeout: '15s' })
      );
      linkTrend.add(linkRes.timings.duration);
      check(linkRes, {
        'link: 200':           (rs) => rs.status === 200,
        'link: success=true':  (rs) => rs.json('success') === true,
      });
      if (linkRes.status !== 200) {
        console.error(`[link] rule=${r.id} → tpl=${targetTemplateId} HTTP ${linkRes.status}: ${(linkRes.body || '').slice(0, 200)}`);
      }
    }
    console.log(`[link] đã link ${rules.length} rule(s) với template ${targetTemplateId}`);
  } else {
    console.log(`[link] skip — dossier có ${templates.length} template, ${rules.length} rule`);
  }

  // ── 3) Enqueue validate ─────────────────────────────────────────────────
  const t0 = Date.now();
  const enqRes = http.post(validateEnqueueUrl(dossierId), null,
    authParams(tokens, { tags: { name: 'validate_enqueue' }, timeout: '30s' }));
  enqueueTrend.add(enqRes.timings.duration);

  const enqBody = (() => { try { return enqRes.json(); } catch (_) { return null; } })();

  const enqOk = check(enqRes, {
    'enqueue: 200': (r) => r.status === 200,
    'enqueue: có job id': () => typeof enqBody?.id === 'string' && enqBody.id.length > 0,
    'enqueue: job_type=dossier.validate': () => enqBody?.job_type === 'dossier.validate',
    'enqueue: target_id khớp': () =>
      enqBody?.target_id === String(dossierId) || enqBody?.dossier_id === dossierId,
  });

  if (!enqOk || !enqBody?.id) {
    console.error(`[enqueue] HTTP ${enqRes.status}: ${(enqRes.body || '').slice(0, 300)}`);
    fail('enqueue failed');
  }
  console.log(`[enqueue] dossier=${dossierId} → job_id=${enqBody.id} (status=${enqBody.status})`);

  // ── 4) Poll ─────────────────────────────────────────────────────────────
  const pollResult = pollJob(tokens, enqBody.id, {
    timeoutMs: 120000,
    intervalMs: 1000,
  });
  pollTrend.add(pollResult.elapsedMs);
  e2eTrend.add(Date.now() - t0);

  check(pollResult, {
    'poll: terminal': (p) => p.terminal === true,
    'poll: có job body': (p) => p.job != null,
  });

  if (!pollResult.terminal) {
    timeoutCnt.add(1);
    console.error(`[poll] timeout after ${pollResult.elapsedMs}ms, ${pollResult.polls} polls`);
    return;
  }
  const finalJob = pollResult.job;
  console.log(`[poll] status=${finalJob.status} (polled ${pollResult.polls}× in ${pollResult.elapsedMs}ms)`);

  // ── 5) Validate result schema ──────────────────────────────────────────
  if (finalJob.status === 'completed') {
    completedCnt.add(1);

    // Precondition fail trong result (success=false + message khớp)
    if (isValidatePreconditionFail(finalJob.result)) {
      preconditionCnt.add(1);
      check(null, {
        'precondition-fail: success=false':  () => finalJob.result.success === false,
        'precondition-fail: có message':     () =>
          typeof finalJob.result.message === 'string' && finalJob.result.message.length > 0,
      });
      console.log(`[ok-precondition] ${finalJob.result.message}`);
    } else {
      // Validation thực sự chạy → check schema đầy đủ
      const v = validateValidateResult(finalJob.result);
      check(null, {
        'result: schema hợp lệ':              () => v.ok,
        'result: success=true':                () => finalJob.result?.success === true,
        'result: total_rules ≥ 0':             () => finalJob.result?.total_rules >= 0,
        'result: executed = passed+failed+errors+advisory': () => {
          const r = finalJob.result;
          return r?.executed === (r?.passed + r?.failed + r?.errors + r?.advisory);
        },
        'result: results[] có rule_id + status': () =>
          Array.isArray(finalJob.result?.results) &&
          finalJob.result.results.every((r) =>
            typeof r.rule_id === 'number' && typeof r.status === 'string'),
        'result: mỗi rule có result_details.comparisons[]': () =>
          finalJob.result?.results?.every((r) =>
            Array.isArray(r.result_details?.comparisons)),
        'result: rule status ∈ {pass,fail,error,advisory}': () =>
          finalJob.result?.results?.every((r) =>
            ['pass','fail','error','advisory'].includes(r.status)),
      });

      if (!v.ok) {
        console.error(`[validate] errors:\n  - ${v.errors.join('\n  - ')}`);
        console.error(`[validate] result: ${JSON.stringify(finalJob.result).slice(0, 600)}`);
      } else {
        console.log(`[ok] ${summarizeValidateResult(finalJob.result)}`);
      }
    }
  } else if (finalJob.status === 'failed') {
    // Tách precondition-fail (vd 400: No extracted data) khỏi real failure
    if (isValidatePreconditionFailFromError(finalJob.error_message)) {
      preconditionCnt.add(1);
      check(null, {
        'precondition-fail (status=failed): có error_message': () =>
          typeof finalJob.error_message === 'string' && finalJob.error_message.length > 0,
      });
      console.log(`[ok-precondition] (status=failed) ${finalJob.error_message}`);
    } else {
      failedCnt.add(1);
      console.error(`[job-failed] ${finalJob.error_message}`);
      check(null, {
        'failed job: có error_message': () => typeof finalJob.error_message === 'string',
      });
    }
  }

  sleep(2);
}

export const handleSummary = buildSummary('assessment-tham-dinh-smoke');
