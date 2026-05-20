/**
 * Stress test — POST /v1/rules
 *
 * Chạy:
 *   k6 run tests/rules/stress/create.js
 *   k6 run -e MAX_VU=10 tests/rules/stress/create.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';

import { login, authParams } from '../../../lib/auth.js';
import { stages } from '../../../lib/stages.js';
import { buildSummary } from '../../../lib/report.js';
import {
  getAdminUser,
  deleteRule,
  pickId,
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
    'http_req_duration{name:rules_create}': ['p(95)<3000'],
  },
};

export function setup() {
  const admin = getAdminUser(users);
  const tokens = login(admin);
  if (!tokens.accessToken) throw new Error(`login failed for ${admin.username}`);

  const runId = `_stress_create_rule_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  console.log(`setup: runId = ${runId}`);
  return { tokens, runId };
}

export default function ({ tokens, runId }) {
  const payload = JSON.stringify({
    name: `${runId}_${__VU}_${__ITER}`,
    ...SAMPLE_RULE,
    tags: ['_stress', runId],
  });

  const res = http.post(RULES_URL, payload,
    authParams(tokens, { tags: { name: 'rules_create' } }));

  check(res, {
    'create: 200/201': (r) => r.status === 200 || r.status === 201,
    'create: has id':  (r) => pickId(r) != null,
  });

  sleep(randomIntBetween(1, 2));
}

export function teardown({ tokens, runId }) {
  console.log(`teardown: cleanup rules với name chứa "${runId}"`);
  let totalDeleted = 0;
  let totalFailed = 0;
  for (let page = 1; page <= 100; page++) {
    const listRes = http.get(
      `${RULES_URL}?search=${encodeURIComponent(runId)}&page=${page}&size=100`,
      authParams(tokens)
    );
    if (listRes.status !== 200) {
      console.error(`teardown: list page=${page} failed HTTP ${listRes.status}`);
      break;
    }
    const items = listRes.json('items') ?? listRes.json('data') ?? [];
    if (items.length === 0) break;

    for (const r of items) {
      if (r?.id == null) continue;
      const d = deleteRule(tokens, r.id);
      if (d.status === 200) totalDeleted++; else totalFailed++;
    }
    if (items.length < 100) break;
  }
  console.log(`teardown: deleted=${totalDeleted} failed=${totalFailed}`);
}

export const handleSummary = buildSummary('rules-create-stress');
