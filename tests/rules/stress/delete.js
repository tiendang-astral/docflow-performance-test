/**
 * Stress test — DELETE /v1/rules/{id}
 *
 * Strategy: mỗi iteration TỰ tạo 1 doomed rule rồi DELETE ngay → self-contained.
 * Latency thao tác DELETE đo qua tag `rules_delete`.
 *
 * Chạy:
 *   k6 run tests/rules/stress/delete.js
 *   k6 run -e MAX_VU=10 tests/rules/stress/delete.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';

import { login, authParams } from '../../../lib/auth.js';
import { stages } from '../../../lib/stages.js';
import { buildSummary } from '../../../lib/report.js';
import {
  getAdminUser,
  createRule,
  deleteRule,
  SAMPLE_RULE,
  RULES_URL,
} from '../../../lib/rules-helper.js';
import { randomIntBetween } from '../../../lib/utils.js';

const users = new SharedArray('users', () =>
  JSON.parse(open('../../../data/seed/users.json'))
);

export const options = {
  stages: stages.stress,
  thresholds: {
    checks: ['rate>0.95'],
    http_req_failed: ['rate<0.05'],
    'http_req_duration{name:rules_delete}': ['p(95)<2500'],
  },
};

export function setup() {
  const admin = getAdminUser(users);
  const tokens = login(admin);
  if (!tokens.accessToken) throw new Error(`login failed for ${admin.username}`);

  const runId = `_stress_delete_rule_${Date.now()}`;
  console.log(`setup: runId = ${runId}`);
  return { tokens, runId };
}

export default function ({ tokens, runId }) {
  let id;
  try {
    id = createRule(tokens, {
      name: `${runId}_${__VU}_${__ITER}`,
      ...SAMPLE_RULE,
      tags: ['_stress', runId],
    });
  } catch (e) {
    sleep(1);
    return;
  }
  if (id == null) return;

  const res = http.del(`${RULES_URL}/${id}`, null,
    authParams(tokens, { tags: { name: 'rules_delete' } }));

  check(res, {
    'delete: 200': (r) => r.status === 200,
  });

  sleep(randomIntBetween(1, 2));
}

export function teardown({ tokens, runId }) {
  console.log(`teardown: sweep rule còn sót với name chứa "${runId}"`);
  let totalDeleted = 0;
  for (let page = 1; page <= 100; page++) {
    const listRes = http.get(
      `${RULES_URL}?search=${encodeURIComponent(runId)}&page=${page}&size=100`,
      authParams(tokens)
    );
    if (listRes.status !== 200) break;
    const items = listRes.json('items') ?? listRes.json('data') ?? [];
    if (items.length === 0) break;

    for (const r of items) {
      if (r?.id == null) continue;
      const d = deleteRule(tokens, r.id);
      if (d.status === 200) totalDeleted++;
    }
    if (items.length < 100) break;
  }
  console.log(`teardown: swept ${totalDeleted} leftover(s)`);
}

export const handleSummary = buildSummary('rules-delete-stress');
