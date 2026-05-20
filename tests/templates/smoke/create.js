/**
 * Smoke test — POST /v1/templates
 *
 * Mỗi iteration tạo 1 template với tên/tag duy nhất theo runId.
 * teardown() quét template có tag = runId và xóa hết → seed data nguyên vẹn.
 *
 * Chạy: k6 run tests/templates/create.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';

import { login, authParams } from '../../../lib/auth.js';
import { buildSummary } from '../../../lib/report.js';
import {
  getAdminUser,
  deleteTemplate,
  pickId,
  SAMPLE_FIELDS,
  TEMPLATES_URL,
} from '../../../lib/templates-helper.js';

const users = new SharedArray('users', () =>
  JSON.parse(open('../../../data/seed/users.json'))
);

export const options = {
  vus: 1,
  iterations: 1,
  duration: '10s',
  thresholds: {
    checks: ['rate>0.99'],
    'http_req_duration{name:templates_create}': ['p(95)<1500'],
  },
};

export function setup() {
  const admin = getAdminUser(users);
  const tokens = login(admin);
  if (!tokens.accessToken) throw new Error(`login failed for ${admin.username}`);

  // Unique tag để teardown query lại
  const runId = `_smoke_create_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  console.log(`setup: runId = ${runId}`);
  return { tokens, runId };
}

export default function ({ tokens, runId }) {
  const payload = JSON.stringify({
    name: `${runId}_${__VU}_${__ITER}`,
    description: 'Smoke create test — sẽ bị xóa ở teardown',
    tags: ['_smoke', runId],
    fields: SAMPLE_FIELDS,
  });

  const res = http.post(TEMPLATES_URL, payload,
    authParams(tokens, { tags: { name: 'templates_create' } }));

  check(res, {
    'create: 200/201': (r) => r.status === 200 || r.status === 201,
    'create: has id':  (r) => pickId(r) != null,
  });

  sleep(1);
}

export function teardown({ tokens, runId }) {
  console.log(`teardown: cleanup templates với name chứa "${runId}"`);
  const listRes = http.get(
    `${TEMPLATES_URL}?search=${encodeURIComponent(runId)}&size=100`,
    authParams(tokens)
  );
  if (listRes.status !== 200) {
    console.error(`teardown: list failed HTTP ${listRes.status}`);
    return;
  }
  const items = listRes.json('items') ?? listRes.json('data') ?? [];
  console.log(`teardown: found ${items.length} template(s) cần xóa`);

  let deleted = 0;
  let failed = 0;
  for (const t of items) {
    if (t?.id == null) continue;
    const d = deleteTemplate(tokens, t.id);
    if (d.status === 200) deleted++; else failed++;
  }
  console.log(`teardown: deleted=${deleted} failed=${failed}`);
}

export const handleSummary = buildSummary('templates-create-smoke');
