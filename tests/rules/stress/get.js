/**
 * Stress test — GET /v1/rules/{id}
 *
 * Chạy:
 *   k6 run tests/rules/stress/get.js
 *   k6 run -e MAX_VU=20 tests/rules/stress/get.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';

import { login, authParams } from '../../../lib/auth.js';
import { stages } from '../../../lib/stages.js';
import { buildSummary } from '../../../lib/report.js';
import {
  getAdminUser,
  findSeedRuleIds,
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
    'http_req_duration{name:rules_get}':       ['p(95)<1500'],
    'http_req_duration{name:rules_not_found}': ['p(95)<800'],
  },
};

export function setup() {
  const admin = getAdminUser(users);
  const tokens = login(admin);
  if (!tokens.accessToken) throw new Error(`login failed for ${admin.username}`);
  const seedIds = findSeedRuleIds(tokens, 30);
  console.log(`setup: ${seedIds.length} rule id sẵn sàng cho GET stress`);
  return { tokens, seedIds };
}

export default function ({ tokens, seedIds }) {
  const useInvalid = randomIntBetween(0, 9) === 0;
  if (useInvalid) {
    const res = http.get(`${RULES_URL}/999999999`,
      authParams(tokens, { tags: { name: 'rules_not_found' } }));
    check(res, { 'not-found: 404': (r) => r.status === 404 });
  } else {
    const id = seedIds[randomIntBetween(0, seedIds.length - 1)];
    const res = http.get(`${RULES_URL}/${id}`,
      authParams(tokens, { tags: { name: 'rules_get' } }));
    check(res, {
      'get: 200':         (r) => r.status === 200,
      'get: id matches':  (r) => (r.json('id') ?? r.json('data.id')) === id,
    });
  }

  sleep(randomIntBetween(1, 2));
}

export const handleSummary = buildSummary('rules-get-stress');
