/**
 * Smoke test — GET /v1/rules/{id}
 *
 * Read-only → không có teardown.
 *
 * Chạy: k6 run tests/rules/smoke/get.js
 */

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { SharedArray } from 'k6/data';

import { login, authParams } from '../../../lib/auth.js';
import { buildSummary } from '../../../lib/report.js';
import {
  getAdminUser,
  findSeedRuleIds,
  RULES_URL,
} from '../../../lib/rules-helper.js';

const users = new SharedArray('users', () =>
  JSON.parse(open('../../../data/seed/users.json'))
);

export const options = {
  vus: 1,
  iterations: 1,
  duration: '10s',
  thresholds: {
    checks: ['rate>0.99'],
    'http_req_duration{name:rules_get}':       ['p(95)<500'],
    'http_req_duration{name:rules_not_found}': ['p(95)<500'],
  },
};

export function setup() {
  const admin = getAdminUser(users);
  const tokens = login(admin);
  if (!tokens.accessToken) throw new Error(`login failed for ${admin.username}`);
  const seedIds = findSeedRuleIds(tokens, 30);
  console.log(`setup: ${seedIds.length} seed rules → ${seedIds.slice(0, 5).join(',')}…`);
  return { tokens, seedIds };
}

export default function ({ tokens, seedIds }) {
  group('GET /v1/rules/{id}', () => {
    const id = seedIds[__ITER % seedIds.length];

    // Happy path
    {
      const res = http.get(`${RULES_URL}/${id}`,
        authParams(tokens, { tags: { name: 'rules_get' } }));
      check(res, {
        'get: 200': (r) => r.status === 200,
        'get: id matches':       (r) => (r.json('id') ?? r.json('data.id')) === id,
        'get: has condition':    (r) => {
          const c = r.json('condition') ?? r.json('data.condition');
          return typeof c === 'string' && c.length > 0;
        },
      });
    }

    // Negative: ID không tồn tại
    {
      const res = http.get(`${RULES_URL}/999999999`,
        authParams(tokens, { tags: { name: 'rules_not_found' } }));
      check(res, {
        'not-found: 404': (r) => r.status === 404,
      });
    }
  });

  sleep(1);
}

export const handleSummary = buildSummary('rules-get-smoke');
