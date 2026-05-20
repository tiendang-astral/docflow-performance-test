/**
 * Smoke test — POST /v1/assessment/{dossier_id}/validate
 *
 * Trigger chạy tất cả rules trên dossier → trả về validation results summary.
 * KHÔNG persist entity mới → không cần teardown.
 *
 * Ghi chú: nếu dossier CHƯA có extracted data (chưa upload + extract PDF),
 * endpoint trả về HTTP 400 với detail "No extracted data available for validation".
 * Smoke chấp nhận response này là healthy — endpoint alive, chỉ thiếu precondition.
 *
 * Để test FULL validate (HTTP 200 với data thật), cần:
 *   1. Upload PDF qua POST /v1/assessment/{id}/upload/{template_id}
 *   2. Đợi background extraction xong (Dagster sync)
 *   3. Mới chạy validate
 *
 * Chạy: k6 run tests/assessment/smoke/validate.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';

import { login, authParams } from '../../../lib/auth.js';
import { buildSummary } from '../../../lib/report.js';
import { getAdminUser, validateUrl } from '../../../lib/assessment-helper.js';
import { findSeedDossierIds } from '../../../lib/dossiers-helper.js';

const users = new SharedArray('users', () =>
  JSON.parse(open('../../../data/seed/users.json'))
);

export const options = {
  vus: 1,
  iterations: 1,
  duration: '60s',  // Validate chạy nhiều rule → có thể chậm
  thresholds: {
    checks: ['rate>0.95'],
    // Mỗi rule "prompt" gọi LLM → tổng thời gian phụ thuộc số rule trong dossier
    'http_req_duration{name:assessment_validate}': ['p(95)<30000'],
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

  const res = http.post(validateUrl(id), null,
    authParams(tokens, { tags: { name: 'assessment_validate' }, timeout: '120s' }));

  // Endpoint healthy nếu: 200 (có data + validate được) HOẶC 400 với detail
  // "No extracted data" (precondition không thỏa nhưng endpoint trả lỗi đúng).
  const body = (() => { try { return res.json(); } catch (_) { return null; } })();
  const noDataMsg = body?.detail && /no extracted data/i.test(body.detail);

  check(res, {
    'validate: 200 hoặc 400-no-data':
      (r) => r.status === 200 || (r.status === 400 && noDataMsg),
  });

  if (res.status === 200) {
    check(null, {
      'response: là object': () => body && typeof body === 'object',
    });
    console.log(`[ok-200] dossier_id=${id} validated`);
  } else if (res.status === 400 && noDataMsg) {
    console.log(`[ok-400] dossier_id=${id} chưa có extracted data (endpoint alive)`);
  } else {
    console.error(`[validate] HTTP ${res.status}: ${(res.body || '').slice(0, 300)}`);
  }

  sleep(2);
}

export const handleSummary = buildSummary('assessment-validate-smoke');
