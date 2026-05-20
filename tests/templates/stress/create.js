/**
 * Stress test — POST /v1/templates
 *
 * Mỗi iteration tạo 1 template với name có chứa runId duy nhất.
 * Teardown quét theo `search=${runId}` và xóa toàn bộ.
 *
 * Lưu ý: ở MAX_VU lớn, số template tạo ra có thể rất nhiều → teardown chậm.
 * Có thể chạy với MAX_VU thấp để cleanup nhanh hơn.
 *
 * Chạy:
 *   k6 run tests/templates/stress/create.js
 *   k6 run -e MAX_VU=10 tests/templates/stress/create.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';

import { login, authParams } from '../../../lib/auth.js';
import { stages } from '../../../lib/stages.js';
import { buildSummary } from '../../../lib/report.js';
import {
  getAdminUser,
  deleteTemplate,
  pickId,
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
    'http_req_duration{name:templates_create}': ['p(95)<3000'],
  },
};

export function setup() {
  const admin = getAdminUser(users);
  const tokens = login(admin);
  if (!tokens.accessToken) throw new Error(`login failed for ${admin.username}`);

  const runId = `_stress_create_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  console.log(`setup: runId = ${runId}`);
  return { tokens, runId };
}

export default function ({ tokens, runId }) {
  const payload = JSON.stringify({
    name: `${runId}_${__VU}_${__ITER}`,
    description: 'Stress create — sẽ cleanup ở teardown',
    tags: ['_stress', runId],
    fields: SAMPLE_FIELDS,
  });

  const res = http.post(TEMPLATES_URL, payload,
    authParams(tokens, { tags: { name: 'templates_create' } }));

  check(res, {
    'create: 200/201': (r) => r.status === 200 || r.status === 201,
    'create: has id':  (r) => pickId(r) != null,
  });

  sleep(randomIntBetween(1, 2));
}

export function teardown({ tokens, runId }) {
  console.log(`teardown: cleanup tất cả template có name chứa "${runId}"`);
  let totalDeleted = 0;
  let totalFailed = 0;
  // Lặp page cho đến khi hết
  for (let page = 1; page <= 100; page++) {
    const listRes = http.get(
      `${TEMPLATES_URL}?search=${encodeURIComponent(runId)}&page=${page}&size=100`,
      authParams(tokens)
    );
    if (listRes.status !== 200) {
      console.error(`teardown: list page=${page} failed HTTP ${listRes.status}`);
      break;
    }
    const items = listRes.json('items') ?? listRes.json('data') ?? [];
    if (items.length === 0) break;

    for (const t of items) {
      if (t?.id == null) continue;
      const d = deleteTemplate(tokens, t.id);
      if (d.status === 200) totalDeleted++; else totalFailed++;
    }
    // Nếu page < size thì hết — break sớm
    if (items.length < 100) break;
  }
  console.log(`teardown: deleted=${totalDeleted} failed=${totalFailed}`);
}

export const handleSummary = buildSummary('templates-create-stress');
