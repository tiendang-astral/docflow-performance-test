/**
 * Stress test — DELETE /v1/templates/{id}
 *
 * Strategy: mỗi iteration TỰ tạo 1 doomed template rồi DELETE ngay → self-contained,
 * không cần pool lớn ở setup, không lo race condition cạn pool.
 * Latency của thao tác DELETE được đo qua tag `templates_delete`.
 *
 * Chạy:
 *   k6 run tests/templates/stress/delete.js
 *   k6 run -e MAX_VU=10 tests/templates/stress/delete.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';

import { login, authParams } from '../../../lib/auth.js';
import { stages } from '../../../lib/stages.js';
import { buildSummary } from '../../../lib/report.js';
import {
  getAdminUser,
  createTemplate,
  deleteTemplate,
  SAMPLE_FIELDS,
  TEMPLATES_URL,
} from '../../../lib/templates-helper.js';
import { randomIntBetween } from '../../../lib/utils.js';

const users = new SharedArray('users', () =>
  JSON.parse(open('../../../data/seed/users.json'))
);

export const options = {
  stages: stages.stress,
  thresholds: {
    checks: ['rate>0.95'],
    http_req_failed: ['rate<0.05'],
    'http_req_duration{name:templates_delete}': ['p(95)<2500'],
  },
};

export function setup() {
  const admin = getAdminUser(users);
  const tokens = login(admin);
  if (!tokens.accessToken) throw new Error(`login failed for ${admin.username}`);

  const runId = `_stress_delete_${Date.now()}`;
  console.log(`setup: runId = ${runId}`);
  return { tokens, runId };
}

export default function ({ tokens, runId }) {
  // 1. Tạo 1 doomed
  let id;
  try {
    id = createTemplate(tokens, {
      name: `${runId}_${__VU}_${__ITER}`,
      description: 'Doomed cho stress delete',
      tags: ['_stress', runId],
      fields: SAMPLE_FIELDS,
    });
  } catch (e) {
    // Không tạo được → skip iteration
    sleep(1);
    return;
  }
  if (id == null) return;

  // 2. DELETE — đây là endpoint được đo
  const res = http.del(`${TEMPLATES_URL}/${id}`, null,
    authParams(tokens, { tags: { name: 'templates_delete' } }));

  check(res, {
    'delete: 200': (r) => r.status === 200,
  });

  sleep(randomIntBetween(1, 2));
}

export function teardown({ tokens, runId }) {
  // Sweep cho an toàn — phòng trường hợp test fail giữa create và delete
  console.log(`teardown: sweep template còn sót với name chứa "${runId}"`);
  let totalDeleted = 0;
  for (let page = 1; page <= 100; page++) {
    const listRes = http.get(
      `${TEMPLATES_URL}?search=${encodeURIComponent(runId)}&page=${page}&size=100`,
      authParams(tokens)
    );
    if (listRes.status !== 200) break;
    const items = listRes.json('items') ?? listRes.json('data') ?? [];
    if (items.length === 0) break;

    for (const t of items) {
      if (t?.id == null) continue;
      const d = deleteTemplate(tokens, t.id);
      if (d.status === 200) totalDeleted++;
    }
    if (items.length < 100) break;
  }
  console.log(`teardown: swept ${totalDeleted} leftover(s)`);
}

export const handleSummary = buildSummary('templates-delete-stress');
