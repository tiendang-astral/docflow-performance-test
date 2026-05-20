/**
 * Stress test — POST /v2/dossiers/{id}/pool/upload
 *
 * Strategy:
 *   - setup() tạo N dossier (1 cái / VU) để các VU không tranh nhau cùng pool
 *   - Mỗi iteration upload 1 file (random size: small / medium)
 *   - teardown() xóa hết các dossier (cascade pool files)
 *
 * Lưu ý:
 *   - Mặc định KHÔNG dùng PDF >25MB để tránh k6 OOM và timeout.
 *   - Có thể set LARGE=true để bật file 100MB (cần check timeout phù hợp).
 *
 * Chạy:
 *   k6 run tests/uploads/stress/upload.js
 *   k6 run -e MAX_VU=10 tests/uploads/stress/upload.js
 *   k6 run -e MAX_VU=5 -e LARGE=true tests/uploads/stress/upload.js
 */

import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';

import { login } from '../../../lib/auth.js';
import { stages } from '../../../lib/stages.js';
import { buildSummary } from '../../../lib/report.js';
import {
  getAdminUser,
  pickId,
  uploadToPool,
  createTestDossier,
  deleteTestDossier,
} from '../../../lib/uploads-helper.js';
import { randomIntBetween } from '../../../lib/utils.js';

const users = new SharedArray('users', () =>
  JSON.parse(open('../../../data/seed/users.json'))
);

// Load PDF fixtures (init context)
const PDF_SMALL  = open('../../../data/fixtures/pdfs/invoice-small-pass.pdf', 'b');  // 200KB
const PDF_MEDIUM = open('../../../data/fixtures/pdfs/contract-medium-pass.pdf', 'b'); // 2MB
const PDF_LARGE_ENABLED = __ENV.LARGE === 'true';
const PDF_LARGE = PDF_LARGE_ENABLED
  ? open('../../../data/fixtures/pdfs/scan-xlarge-pass.pdf', 'b')   // 128MB
  : null;

const MAX_VU = __ENV.MAX_VU ? parseInt(__ENV.MAX_VU, 10) : 200;
const DOSSIER_POOL_COUNT = MAX_VU + 5;

export const options = {
  stages: stages.stress,
  thresholds: {
    checks: ['rate>0.95'],
    http_req_failed: ['rate<0.05'],
    'http_req_duration{name:upload_small}':  ['p(95)<5000'],
    'http_req_duration{name:upload_medium}': ['p(95)<15000'],
    'http_req_duration{name:upload_large}':  ['p(95)<60000'],
  },
};

export function setup() {
  const admin = getAdminUser(users);
  const tokens = login(admin);
  if (!tokens.accessToken) throw new Error(`login failed for ${admin.username}`);

  console.log(`setup: tạo ${DOSSIER_POOL_COUNT} test dossiers...`);
  const dossierIds = [];
  const runId = `_stress_upload_${Date.now()}`;
  for (let i = 0; i < DOSSIER_POOL_COUNT; i++) {
    try {
      const id = createTestDossier(tokens, `${runId}_${i}`);
      if (id != null) dossierIds.push(id);
    } catch (e) {
      console.error(`setup: tạo dossier #${i} thất bại: ${e.message}`);
    }
  }
  console.log(`setup: ${dossierIds.length}/${DOSSIER_POOL_COUNT} dossiers sẵn sàng (large=${PDF_LARGE_ENABLED})`);
  return { tokens, dossierIds };
}

export default function ({ tokens, dossierIds }) {
  if (dossierIds.length === 0) return;

  // Mỗi VU dùng dossier riêng để giảm hot-spot
  const dossierId = dossierIds[(__VU - 1) % dossierIds.length];

  // Chọn size theo phân bổ: 70% small, 25% medium, 5% large (nếu LARGE enabled)
  const r = randomIntBetween(0, 99);
  let fileData, mimeName, tagName;
  if (PDF_LARGE_ENABLED && r >= 95) {
    fileData = PDF_LARGE;
    mimeName = `large-${__VU}-${__ITER}.pdf`;
    tagName = 'upload_large';
  } else if (r >= 70) {
    fileData = PDF_MEDIUM;
    mimeName = `medium-${__VU}-${__ITER}.pdf`;
    tagName = 'upload_medium';
  } else {
    fileData = PDF_SMALL;
    mimeName = `small-${__VU}-${__ITER}.pdf`;
    tagName = 'upload_small';
  }

  const res = uploadToPool(tokens, dossierId, fileData, mimeName, 'application/pdf',
    { tags: { name: tagName } });

  check(res, {
    'upload: 200/201':     (r) => r.status === 200 || r.status === 201,
    'upload: has file id': (r) => pickId(r) != null,
  });

  sleep(randomIntBetween(1, 3));
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

export const handleSummary = buildSummary('uploads-upload-stress');
