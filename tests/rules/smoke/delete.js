/**
 * Smoke test — DELETE /v1/rules/{id}
 *
 * Strategy: KHÔNG xóa seed rule. setup() tạo trước N "doomed" rule,
 * mỗi iteration xóa 1. teardown() dọn nốt.
 *
 * Chạy: k6 run tests/rules/smoke/delete.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';

import { login, authParams } from '../../../lib/auth.js';
import { buildSummary } from '../../../lib/report.js';
import {
  getAdminUser,
  createRule,
  deleteRule,
  SAMPLE_RULE,
  RULES_URL,
} from '../../../lib/rules-helper.js';

const users = new SharedArray('users', () =>
  JSON.parse(open('../../../data/seed/users.json'))
);

const DOOMED_COUNT = 30;

export const options = {
  vus: 1,
  iterations: 1,
  duration: '10s',
  thresholds: {
    checks: ['rate>0.99'],
    'http_req_duration{name:rules_delete}':       ['p(95)<1000'],
    'http_req_duration{name:rules_verify_gone}':  ['p(95)<500'],
  },
};

export function setup() {
  const admin = getAdminUser(users);
  const tokens = login(admin);
  if (!tokens.accessToken) throw new Error(`login failed for ${admin.username}`);

  const runId = `_smoke_doomed_rule_${Date.now()}`;
  console.log(`setup: creating ${DOOMED_COUNT} doomed rules (${runId})...`);
  const doomedIds = [];
  for (let i = 0; i < DOOMED_COUNT; i++) {
    try {
      const id = createRule(tokens, {
        name: `${runId}_${i}`,
        ...SAMPLE_RULE,
        tags: ['_smoke', runId],
      });
      if (id != null) doomedIds.push(id);
    } catch (e) {
      console.error(`setup: tạo doomed #${i} thất bại: ${e.message}`);
    }
  }
  console.log(`setup: tạo được ${doomedIds.length} doomed rules`);
  return { tokens, doomedIds };
}

export default function ({ tokens, doomedIds }) {
  const idx = __ITER;
  if (idx >= doomedIds.length) {
    sleep(1);
    return;
  }
  const id = doomedIds[idx];

  // DELETE
  const del = http.del(`${RULES_URL}/${id}`, null,
    authParams(tokens, { tags: { name: 'rules_delete' } }));
  check(del, {
    'delete: 200': (r) => r.status === 200,
  });

  // Verify đã xóa
  const get = http.get(`${RULES_URL}/${id}`,
    authParams(tokens, { tags: { name: 'rules_verify_gone' } }));
  check(get, {
    'verify: 404': (r) => r.status === 404,
  });

  sleep(1);
}

export function teardown({ tokens, doomedIds }) {
  console.log(`teardown: cleanup doomed rules còn sót...`);
  let cleaned = 0;
  for (const id of doomedIds) {
    const d = deleteRule(tokens, id);
    if (d.status === 200) cleaned++;
  }
  console.log(`teardown: cleaned=${cleaned}`);
}

export const handleSummary = buildSummary('rules-delete-smoke');
