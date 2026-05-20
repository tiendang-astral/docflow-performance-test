/**
 * Smoke test — POST /v2/dossiers/{id}/pool/upload
 *
 * Strategy:
 *   - setup() tạo 1 dossier riêng + load PDF fixture nhỏ
 *   - Mỗi iteration upload 1 file
 *   - teardown() xóa toàn bộ dossier (cascade xóa pool files)
 *
 * Chạy: k6 run tests/uploads/smoke/upload.js
 */

import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';

import { login } from '../../../lib/auth.js';
import { buildSummary } from '../../../lib/report.js';
import {
  getAdminUser,
  pickId,
  uploadToPool,
  createTestDossier,
  deleteTestDossier,
} from '../../../lib/uploads-helper.js';

const users = new SharedArray('users', () =>
  JSON.parse(open('../../../data/seed/users.json'))
);

// Load PDF fixture vào memory ở init context (k6 yêu cầu)
const PDF_SMALL = open('../../../data/fixtures/pdfs/invoice-small-pass.pdf', 'b');

export const options = {
  vus: 1,
  iterations: 1,
  duration: '20s',
  thresholds: {
    checks: ['rate>0.99'],
    'http_req_duration{name:upload_small}': ['p(95)<5000'],
  },
};

export function setup() {
  const admin = getAdminUser(users);
  const tokens = login(admin);
  if (!tokens.accessToken) throw new Error(`login failed for ${admin.username}`);

  const dossierId = createTestDossier(tokens, `_smoke_upload_${Date.now()}`);
  console.log(`setup: dossier_id=${dossierId} (sẽ xóa ở teardown)`);
  return { tokens, dossierId };
}

export default function ({ tokens, dossierId }) {
  const filename = `invoice-${__VU}-${__ITER}-${Date.now()}.pdf`;
  const res = uploadToPool(tokens, dossierId, PDF_SMALL, filename, 'application/pdf',
    { tags: { name: 'upload_small' } });

  check(res, {
    'upload: 200/201':         (r) => r.status === 200 || r.status === 201,
    'upload: has file id':     (r) => pickId(r) != null,
    'upload: response is JSON':(r) => {
      try { return typeof r.json() === 'object'; } catch (_) { return false; }
    },
  });

  if (res.status >= 400) {
    console.error(`[upload] HTTP ${res.status}: ${(res.body || '').slice(0, 300)}`);
  }

  sleep(2);
}

export function teardown({ tokens, dossierId }) {
  console.log(`teardown: xóa dossier ${dossierId} (cascade xóa pool files)`);
  const res = deleteTestDossier(tokens, dossierId);
  if (res.status !== 200) {
    console.error(`teardown: delete dossier failed HTTP ${res.status}: ${(res.body || '').slice(0, 200)}`);
  } else {
    console.log(`teardown: dossier deleted OK`);
  }
}

export const handleSummary = buildSummary('uploads-upload-smoke');
