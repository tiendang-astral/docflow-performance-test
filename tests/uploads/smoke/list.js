/**
 * Smoke test — GET /v2/dossiers/{id}/pool (list pool files)
 *
 * Strategy:
 *   - setup() tạo dossier mới + upload 3 file để có data
 *   - Mỗi iteration GET pool
 *   - teardown() xóa dossier
 *
 * Chạy: k6 run tests/uploads/smoke/list.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';

import { login, authParams } from '../../../lib/auth.js';
import { buildSummary } from '../../../lib/report.js';
import {
  getAdminUser,
  uploadToPool,
  createTestDossier,
  deleteTestDossier,
  poolUrl,
} from '../../../lib/uploads-helper.js';

const users = new SharedArray('users', () =>
  JSON.parse(open('../../../data/seed/users.json'))
);

const PDF_SMALL = open('../../../data/fixtures/pdfs/invoice-small-pass.pdf', 'b');

export const options = {
  vus: 1,
  iterations: 1,
  duration: '10s',
  thresholds: {
    checks: ['rate>0.99'],
    'http_req_duration{name:pool_list}': ['p(95)<800'],
  },
};

export function setup() {
  const admin = getAdminUser(users);
  const tokens = login(admin);
  if (!tokens.accessToken) throw new Error(`login failed for ${admin.username}`);

  const dossierId = createTestDossier(tokens, `_smoke_pool_list_${Date.now()}`);
  console.log(`setup: dossier_id=${dossierId}, seeding 3 file...`);

  for (let i = 0; i < 3; i++) {
    const res = uploadToPool(tokens, dossierId, PDF_SMALL, `seed-${i}.pdf`);
    if (res.status >= 400) {
      console.error(`setup: upload #${i} HTTP ${res.status}`);
    }
  }
  return { tokens, dossierId };
}

export default function ({ tokens, dossierId }) {
  const res = http.get(poolUrl(dossierId),
    authParams(tokens, { tags: { name: 'pool_list' } }));

  check(res, {
    'list: 200':           (r) => r.status === 200,
    'list: items is array': (r) => {
      const body = r.json();
      return Array.isArray(body) || Array.isArray(body?.items) || Array.isArray(body?.data);
    },
    'list: ≥3 file':       (r) => {
      const body = r.json();
      const items = Array.isArray(body) ? body : (body?.items ?? body?.data ?? []);
      return Array.isArray(items) && items.length >= 3;
    },
  });

  sleep(1);
}

export function teardown({ tokens, dossierId }) {
  console.log(`teardown: xóa dossier ${dossierId}`);
  const res = deleteTestDossier(tokens, dossierId);
  if (res.status !== 200) {
    console.error(`teardown: delete dossier failed HTTP ${res.status}`);
  }
}

export const handleSummary = buildSummary('uploads-list-smoke');
