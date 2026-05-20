/**
 * Stress test — POST /v1/assessment/{dossier_id}/validate
 *
 * ⚠️ Validate có thể trigger gọi LLM cho rules type "prompt" → EXPENSIVE.
 * Khuyến nghị MAX_VU thấp (5-20) + monitor cost.
 *
 * Chạy:
 *   k6 run -e MAX_VU=10 tests/assessment/stress/validate.js
 *   k6 run tests/assessment/stress/validate.js          # full ramp (cẩn thận!)
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';

import { login, authParams } from '../../../lib/auth.js';
import { stages } from '../../../lib/stages.js';
import { buildSummary } from '../../../lib/report.js';
import { getAdminUser, validateUrl } from '../../../lib/assessment-helper.js';
import { findSeedDossierIds } from '../../../lib/dossiers-helper.js';
import { randomIntBetween } from '../../../lib/utils.js';

const users = new SharedArray('users', () =>
  JSON.parse(open('../../../data/seed/users.json'))
);

export const options = {
  stages: stages.stress,
  thresholds: {
    checks: ['rate>0.90'],            // validate có thể flaky khi nhiều LLM concurrent
    http_req_failed: ['rate<0.10'],
    'http_req_duration{name:assessment_validate}': ['p(95)<60000'],
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
  const id = seedIds[randomIntBetween(0, seedIds.length - 1)];

  const res = http.post(validateUrl(id), null,
    authParams(tokens, { tags: { name: 'assessment_validate' }, timeout: '120s' }));

  // Chấp nhận 400-no-data như healthy (dossier chưa có extracted data → precondition fail
  // nhưng endpoint trả lỗi đúng cấu trúc). Xem comment trong smoke/validate.js.
  const body = (() => { try { return res.json(); } catch (_) { return null; } })();
  const noDataMsg = body?.detail && /no extracted data/i.test(body.detail);

  check(res, {
    'validate: 200 hoặc 400-no-data':
      (r) => r.status === 200 || (r.status === 400 && noDataMsg),
  });

  if (res.status !== 200 && !(res.status === 400 && noDataMsg)) {
    console.error(`[validate] dossier=${id} HTTP ${res.status}: ${(res.body || '').slice(0, 200)}`);
  }

  sleep(randomIntBetween(2, 5));  // giãn cách vì endpoint nặng
}

export const handleSummary = buildSummary('assessment-validate-stress');
