/**
 * Stress test — GET /v2/dossiers/{id}/pool
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

const SEED_FILES = 10;  // số file pre-load trong dossier để list non-empty

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

  const dossierId = createTestDossier(tokens, `_stress_pool_list_${Date.now()}`);
  console.log(`setup: dossier_id=${dossierId}, pre-load ${SEED_FILES} files...`);
  for (let i = 0; i < SEED_FILES; i++) {
    const r = uploadToPool(tokens, dossierId, PDF_SMALL, `seed-${i}.pdf`);
    if (r.status >= 400) console.error(`setup: upload #${i} HTTP ${r.status}`);
  }
  return { tokens, dossierId };
}

export default function ({ tokens, dossierId }) {
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

export function teardown({ tokens, dossierId }) {
  console.log(`teardown: xóa dossier ${dossierId}`);
  deleteTestDossier(tokens, dossierId);
}

export const handleSummary = buildSummary('uploads-list-stress');
