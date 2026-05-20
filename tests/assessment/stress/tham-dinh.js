/**
 * Stress test — Flow "Thẩm định" (Validate, E2E)
 *
 * Strategy:
 *   - Setup: GET 30 dossier id + tự link rule-template 1 LẦN (không lặp mỗi iter)
 *   - Default: POST validate + poll cho đến terminal
 *
 * Bỏ link/get-detail trong default để giảm overhead, tập trung đo throughput
 * của validate endpoint + worker capacity.
 *
 * ⚠️ Validate chạy LLM cho rule_type=prompt → expensive. MAX_VU thấp (10-30).
 *
 * Chạy:
 *   k6 run -e MAX_VU=10 tests/assessment/stress/tham-dinh.js
 *   k6 run -e MAX_VU=30 tests/assessment/stress/tham-dinh.js
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
  validateEnqueueUrl,
  rulesLinkUrl,
  pollJob,
  isValidatePreconditionFail,
  isValidatePreconditionFailFromError,
} from '../../../lib/jobs-helper.js';
import { randomIntBetween } from '../../../lib/utils.js';

const users = new SharedArray('users', () =>
  JSON.parse(open('../../../data/seed/users.json'))
);

const enqueueTrend  = new Trend('validate_enqueue_duration', true);
const pollTrend     = new Trend('validate_poll_duration',    true);
const e2eTrend      = new Trend('validate_e2e_duration',     true);
const completedCnt    = new Counter('validate_completed');
const failedCnt       = new Counter('validate_failed');
const preconditionCnt = new Counter('validate_precondition_fail');
const timeoutCnt      = new Counter('validate_timeout');
const reusedCnt       = new Counter('validate_reused_existing');

export const options = {
  stages: stages.stress,
  thresholds: {
    checks: ['rate>0.85'],
    http_req_failed: ['rate<0.15'],
    'http_req_duration{name:validate_enqueue}': ['p(95)<5000'],
    'validate_e2e_duration':                    ['p(95)<120000'],
  },
};

/**
 * Setup: pre-link rule-template cho mỗi seed dossier (1 lần) để stress
 * không phải làm thao tác này mỗi iter.
 */
export function setup() {
  const admin = getAdminUser(users);
  const tokens = login(admin);
  if (!tokens.accessToken) throw new Error(`login failed for ${admin.username}`);
  const seedIds = findSeedDossierIds(tokens, 30);
  console.log(`setup: ${seedIds.length} dossier id, pre-link rule-template...`);

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
    } catch (e) {
      // bỏ qua, dossier nào lỗi cũng được — chỉ pre-link best-effort
    }
  }
  console.log(`setup: linked ${linked} rule-template pair across ${seedIds.length} dossiers`);
  return { tokens, seedIds };
}

export default function ({ tokens, seedIds }) {
  // Random dossier để giảm reused_existing
  const dossierId = seedIds[randomIntBetween(0, seedIds.length - 1)];
  const t0 = Date.now();

  // ── Enqueue ────────────────────────────────────────────────────────────
  const enqRes = http.post(validateEnqueueUrl(dossierId), null,
    authParams(tokens, { tags: { name: 'validate_enqueue' }, timeout: '30s' }));
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
  if (enqBody.reused_existing === true) reusedCnt.add(1);

  // ── Poll ───────────────────────────────────────────────────────────────
  const pollResult = pollJob(tokens, enqBody.id, {
    timeoutMs: 180000,
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
    if (isValidatePreconditionFail(finalJob.result)) {
      preconditionCnt.add(1);
      check(null, {
        'result: precondition-fail hợp lệ': () => finalJob.result?.success === false,
      });
    } else {
      check(null, {
        'result: success=true':                          () => finalJob.result?.success === true,
        'result: có results[]':                          () => Array.isArray(finalJob.result?.results),
        'result: executed = passed+failed+errors+advisory': () => {
          const r = finalJob.result;
          return r?.executed === (r?.passed + r?.failed + r?.errors + r?.advisory);
        },
      });
    }
  } else if (finalJob.status === 'failed') {
    if (isValidatePreconditionFailFromError(finalJob.error_message)) {
      preconditionCnt.add(1);
    } else {
      failedCnt.add(1);
    }
  }

  sleep(randomIntBetween(1, 3));
}

export const handleSummary = buildSummary('assessment-tham-dinh-stress');
