/**
 * Stress test — DELETE /v1/dossiers/{id}
 *
 * Strategy: mỗi iteration TỰ tạo 1 doomed dossier rồi DELETE ngay → self-contained.
 *
 * Chạy:
 *   k6 run tests/dossiers/stress/delete.js
 *   k6 run -e MAX_VU=10 tests/dossiers/stress/delete.js
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

export const options = {
  stages: stages.stress,
  thresholds: {
    checks: ['rate>0.95'],
    http_req_failed: ['rate<0.05'],
    'http_req_duration{name:dossiers_delete}': ['p(95)<2500'],
  },
};

export function setup() {
  const admin = getAdminUser(users);
  const tokens = login(admin);
  if (!tokens.accessToken) throw new Error(`login failed for ${admin.username}`);

  const runId = `_stress_delete_dossier_${Date.now()}`;
  console.log(`setup: runId = ${runId}`);
  return { tokens, runId };
}

export default function ({ tokens, runId }) {
  let id;
  try {
    id = createDossier(tokens, {
      name: `${runId}_${__VU}_${__ITER}`,
      ...SAMPLE_DOSSIER,
      tags: ['_stress', runId],
    });
  } catch (e) {
    sleep(1);
    return;
  }
  if (id == null) return;

  const res = http.del(`${DOSSIERS_URL}/${id}`, null,
    authParams(tokens, { tags: { name: 'dossiers_delete' } }));

  check(res, {
    'delete: 200': (r) => r.status === 200,
  });

  sleep(randomIntBetween(1, 2));
}

export function teardown({ tokens, runId }) {
  console.log(`teardown: sweep dossier còn sót với name chứa "${runId}"`);
  let totalDeleted = 0;
  for (let page = 1; page <= 100; page++) {
    const listRes = http.get(
      `${DOSSIERS_URL}?search=${encodeURIComponent(runId)}&page=${page}&size=100`,
      authParams(tokens)
    );
    if (listRes.status !== 200) break;
    const items = listRes.json('items') ?? listRes.json('data') ?? [];
    if (items.length === 0) break;

    for (const d of items) {
      if (d?.id == null) continue;
      const r = deleteDossier(tokens, d.id);
      if (r.status === 200) totalDeleted++;
    }
    if (items.length < 100) break;
  }
  console.log(`teardown: swept ${totalDeleted} leftover(s)`);
}

export const handleSummary = buildSummary('dossiers-delete-stress');
