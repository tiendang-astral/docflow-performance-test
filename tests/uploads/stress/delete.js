/**
 * Stress test — DELETE /v2/dossiers/{id}/pool/{file_id}
 *
 * Strategy: mỗi iteration upload 1 file rồi DELETE ngay → self-contained.
 * Metric `pool_delete` đo riêng latency thao tác DELETE.
 *
 * Chạy:
 *   k6 run tests/uploads/stress/delete.js
 *   k6 run -e MAX_VU=10 tests/uploads/stress/delete.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';

import { login, authParams } from '../../../lib/auth.js';
import { stages } from '../../../lib/stages.js';
import { buildSummary } from '../../../lib/report.js';
import {
  getAdminUser,
  pickId,
  uploadToPool,
  createTestDossier,
  deleteTestDossier,
  poolFileUrl,
} from '../../../lib/uploads-helper.js';
import { randomIntBetween } from '../../../lib/utils.js';

const users = new SharedArray('users', () =>
  JSON.parse(open('../../../data/seed/users.json'))
);

const PDF_SMALL = open('../../../data/fixtures/pdfs/invoice-small-pass.pdf', 'b');

const MAX_VU = __ENV.MAX_VU ? parseInt(__ENV.MAX_VU, 10) : 200;
const DOSSIER_POOL_COUNT = MAX_VU + 5;

export const options = {
  stages: stages.stress,
  thresholds: {
    checks: ['rate>0.95'],
    http_req_failed: ['rate<0.05'],
    'http_req_duration{name:pool_delete}':       ['p(95)<2500'],
    'http_req_duration{name:upload_for_delete}': ['p(95)<5000'],
  },
};

export function setup() {
  const admin = getAdminUser(users);
  const tokens = login(admin);
  if (!tokens.accessToken) throw new Error(`login failed for ${admin.username}`);

  const runId = `_stress_pool_delete_${Date.now()}`;
  console.log(`setup: tạo ${DOSSIER_POOL_COUNT} test dossiers (${runId})...`);
  const dossierIds = [];
  for (let i = 0; i < DOSSIER_POOL_COUNT; i++) {
    try {
      const id = createTestDossier(tokens, `${runId}_${i}`);
      if (id != null) dossierIds.push(id);
    } catch (e) {
      console.error(`setup: tạo dossier #${i} thất bại`);
    }
  }
  console.log(`setup: ${dossierIds.length} dossiers sẵn sàng`);
  return { tokens, dossierIds };
}

export default function ({ tokens, dossierIds }) {
  if (dossierIds.length === 0) return;
  const dossierId = dossierIds[(__VU - 1) % dossierIds.length];

  // 1) Upload to get a doomed file
  const upRes = uploadToPool(tokens, dossierId, PDF_SMALL,
    `doomed-${__VU}-${__ITER}.pdf`, 'application/pdf',
    { tags: { name: 'upload_for_delete' } });
  if (upRes.status >= 400) {
    sleep(1);
    return;
  }
  const fileId = pickId(upRes);
  if (fileId == null) return;

  // 2) DELETE — endpoint đo
  const delRes = http.del(poolFileUrl(dossierId, fileId), null,
    authParams(tokens, { tags: { name: 'pool_delete' } }));
  check(delRes, {
    'delete: 200': (r) => r.status === 200,
  });

  sleep(randomIntBetween(1, 2));
}

export function teardown({ tokens, dossierIds }) {
  console.log(`teardown: xóa ${dossierIds.length} test dossiers (cascade pool)...`);
  let deleted = 0;
  let failed = 0;
  for (const id of dossierIds) {
    const r = deleteTestDossier(tokens, id);
    if (r.status === 200) deleted++; else failed++;
  }
  console.log(`teardown: deleted=${deleted} failed=${failed}`);
}

export const handleSummary = buildSummary('uploads-delete-stress');
