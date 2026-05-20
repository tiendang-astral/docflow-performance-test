/**
 * Smoke test — DELETE /v2/dossiers/{id}/pool/{file_id}
 *
 * Strategy: mỗi iteration upload 1 file rồi delete ngay (self-contained).
 *   - setup() tạo dossier riêng
 *   - default upload + delete
 *   - teardown() xóa dossier (cascade)
 *
 * Chạy: k6 run tests/uploads/smoke/delete.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';

import { login, authParams } from '../../../lib/auth.js';
import { buildSummary } from '../../../lib/report.js';
import {
  getAdminUser,
  pickId,
  uploadToPool,
  createTestDossier,
  deleteTestDossier,
  poolFileUrl,
} from '../../../lib/uploads-helper.js';

const users = new SharedArray('users', () =>
  JSON.parse(open('../../../data/seed/users.json'))
);

const PDF_SMALL = open('../../../data/fixtures/pdfs/invoice-small-pass.pdf', 'b');

export const options = {
  vus: 1,
  iterations: 1,
  duration: '20s',
  thresholds: {
    checks: ['rate>0.99'],
    'http_req_duration{name:pool_delete}': ['p(95)<2000'],
  },
};

export function setup() {
  const admin = getAdminUser(users);
  const tokens = login(admin);
  if (!tokens.accessToken) throw new Error(`login failed for ${admin.username}`);

  const dossierId = createTestDossier(tokens, `_smoke_pool_delete_${Date.now()}`);
  console.log(`setup: dossier_id=${dossierId}`);
  return { tokens, dossierId };
}

export default function ({ tokens, dossierId }) {
  // Step 1: upload file để có target xóa
  const upRes = uploadToPool(tokens, dossierId, PDF_SMALL,
    `doomed-${__VU}-${__ITER}.pdf`);
  if (upRes.status >= 400) {
    console.error(`upload fail HTTP ${upRes.status}`);
    return;
  }
  const fileId = pickId(upRes);
  if (fileId == null) {
    console.error('upload response không có file id');
    return;
  }

  // Step 2: DELETE (đây là endpoint đo)
  const delRes = http.del(poolFileUrl(dossierId, fileId), null,
    authParams(tokens, { tags: { name: 'pool_delete' } }));
  check(delRes, {
    'delete: 200': (r) => r.status === 200,
  });

  sleep(1);
}

export function teardown({ tokens, dossierId }) {
  console.log(`teardown: xóa dossier ${dossierId} (cascade)`);
  deleteTestDossier(tokens, dossierId);
}

export const handleSummary = buildSummary('uploads-delete-smoke');
