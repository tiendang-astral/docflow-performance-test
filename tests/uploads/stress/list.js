/**
 * Stress test — GET /v2/dossiers/{id}/pool
 *
 * Mỗi VU pick ngẫu nhiên 1 dossier trong pool đã seed (1 dossier / VU) để
 * tránh hot-spot trên cùng 1 pool. Pre-seed N file để list non-empty.
 *
 * Chạy:
 *   k6 run tests/uploads/stress/list.js
 *   k6 run -e MAX_VU=20 tests/uploads/stress/list.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';

import { login, authParams } from '../../../lib/auth.js';
import { stages } from '../../../lib/stages.js';
import { buildSummary } from '../../../lib/report.js';
import {
  getAdminUser,
  uploadToPool,
  createTestDossier,
  deleteTestDossier,
  poolUrl,
} from '../../../lib/uploads-helper.js';
import { randomIntBetween } from '../../../lib/utils.js';

const users = new SharedArray('users', () =>
  JSON.parse(open('../../../data/seed/users.json'))
);

const PDF_SMALL = open('../../../data/fixtures/pdfs/invoice-small-pass.pdf', 'b');

const MAX_VU = __ENV.MAX_VU ? parseInt(__ENV.MAX_VU, 10) : 50;
const DOSSIER_POOL_COUNT = MAX_VU + 5;
const SEED_FILES_PER_DOSSIER = 5;

export const options = {
  stages: stages.stress,
  thresholds: {
    checks: ['rate>0.95'],
    http_req_failed: ['rate<0.05'],
    'http_req_duration{name:pool_list}': ['p(95)<2000'],
  },
};

export function setup() {
  const admin = getAdminUser(users);
  const tokens = login(admin);
  if (!tokens.accessToken) throw new Error(`login failed for ${admin.username}`);

  console.log(`setup: tạo ${DOSSIER_POOL_COUNT} dossier, pre-load ${SEED_FILES_PER_DOSSIER} files mỗi cái...`);
  const runId = `_stress_pool_list_${Date.now()}`;
  const dossierIds = [];
  for (let i = 0; i < DOSSIER_POOL_COUNT; i++) {
    try {
      const id = createTestDossier(tokens, `${runId}_${i}`);
      if (id == null) continue;
      dossierIds.push(id);
      for (let f = 0; f < SEED_FILES_PER_DOSSIER; f++) {
        const r = uploadToPool(tokens, id, PDF_SMALL, `seed-${i}-${f}.pdf`);
        if (r.status >= 400) console.error(`setup: upload dossier=${id} #${f} HTTP ${r.status}`);
      }
    } catch (e) {
      console.error(`setup: tạo dossier #${i} thất bại: ${e.message}`);
    }
  }
  console.log(`setup: ${dossierIds.length}/${DOSSIER_POOL_COUNT} dossiers ready`);
  return { tokens, dossierIds };
}

export default function ({ tokens, dossierIds }) {
  if (dossierIds.length === 0) return;
  const dossierId = dossierIds[randomIntBetween(0, dossierIds.length - 1)];

  const res = http.get(poolUrl(dossierId),
    authParams(tokens, { tags: { name: 'pool_list' } }));

  check(res, {
    'list: 200': (r) => r.status === 200,
    'list: returns array': (r) => {
      const body = r.json();
      return Array.isArray(body) || Array.isArray(body?.items) || Array.isArray(body?.data);
    },
  });

  sleep(randomIntBetween(1, 2));
}

export function teardown({ tokens, dossierIds }) {
  console.log(`teardown: xóa ${dossierIds.length} dossier (cascade pool)...`);
  let deleted = 0;
  let failed = 0;
  for (const id of dossierIds) {
    const r = deleteTestDossier(tokens, id);
    if (r.status === 200) deleted++; else failed++;
  }
  console.log(`teardown: deleted=${deleted} failed=${failed}`);
}

export const handleSummary = buildSummary('uploads-list-stress');
