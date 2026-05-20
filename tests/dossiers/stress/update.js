/**
 * Stress test — PUT /v1/dossiers/{id}
 *
 * Strategy: setup tạo N "victim" dossier (1 / VU), mỗi VU update VICTIM riêng.
 *
 * Chạy:
 *   k6 run tests/dossiers/stress/update.js
 *   k6 run -e MAX_VU=10 tests/dossiers/stress/update.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';

import { login, authParams } from '../../../lib/auth.js';
import { stages } from '../../../lib/stages.js';
import { buildSummary } from '../../../lib/report.js';
import {
  getAdminUser,
  createDossier,
  deleteDossier,
  SAMPLE_DOSSIER,
  DOSSIERS_URL,
} from '../../../lib/dossiers-helper.js';
import { randomIntBetween } from '../../../lib/utils.js';

const users = new SharedArray('users', () =>
  JSON.parse(open('../../../data/seed/users.json'))
);

const MAX_VU = __ENV.MAX_VU ? parseInt(__ENV.MAX_VU, 10) : 200;
const VICTIM_COUNT = MAX_VU + 5;

export const options = {
  stages: stages.stress,
  thresholds: {
    checks: ['rate>0.95'],
    http_req_failed: ['rate<0.05'],
    'http_req_duration{name:dossiers_update}': ['p(95)<2500'],
  },
};

export function setup() {
  const admin = getAdminUser(users);
  const tokens = login(admin);
  if (!tokens.accessToken) throw new Error(`login failed for ${admin.username}`);

  const runId = `_stress_update_dossier_${Date.now()}`;
  console.log(`setup: tạo ${VICTIM_COUNT} victim dossiers (${runId})...`);

  const victimIds = [];
  for (let i = 0; i < VICTIM_COUNT; i++) {
    try {
      const id = createDossier(tokens, {
        name: `${runId}_${i}`,
        ...SAMPLE_DOSSIER,
        tags: ['_stress', runId],
      });
      if (id != null) victimIds.push(id);
    } catch (e) {
      console.error(`setup: tạo victim #${i} thất bại: ${e.message}`);
    }
  }
  console.log(`setup: ${victimIds.length}/${VICTIM_COUNT} victims sẵn sàng`);

  return { tokens, victimIds, runId };
}

export default function ({ tokens, victimIds }) {
  const idx = (__VU - 1) % victimIds.length;
  const id = victimIds[idx];

  const payload = JSON.stringify({
    name: `[stress-update] ${__VU}-${__ITER}-${Date.now()}`,
    description: 'Updated by stress test',
    tags: ['_stress_update'],
    status: 'draft',
  });

  const res = http.put(`${DOSSIERS_URL}/${id}`, payload,
    authParams(tokens, { tags: { name: 'dossiers_update' } }));

  check(res, {
    'update: 200': (r) => r.status === 200,
  });

  sleep(randomIntBetween(1, 2));
}

export function teardown({ tokens, victimIds }) {
  console.log(`teardown: xóa ${victimIds.length} victim dossiers...`);
  let deleted = 0;
  let failed = 0;
  for (const id of victimIds) {
    const d = deleteDossier(tokens, id);
    if (d.status === 200) deleted++; else failed++;
  }
  console.log(`teardown: deleted=${deleted} failed=${failed}`);
}

export const handleSummary = buildSummary('dossiers-update-stress');
