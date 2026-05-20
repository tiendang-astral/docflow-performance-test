/**
 * Stress test — GET /v1/templates/{id}
 *
 * Read-only → không có teardown.
 * Mỗi VU GET ngẫu nhiên 1 trong các seed template id.
 *
 * Chạy:
 *   k6 run tests/templates/stress/get.js
 *   k6 run -e MAX_VU=20 tests/templates/stress/get.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';

import { login, authParams } from '../../../lib/auth.js';
import { stages } from '../../../lib/stages.js';
import { buildSummary } from '../../../lib/report.js';
import {
  getAdminUser,
  findSeedTemplateIds,
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
    'http_req_duration{name:templates_get}':       ['p(95)<1500'],
    'http_req_duration{name:templates_not_found}': ['p(95)<800'],
  },
};

export function setup() {
  const admin = getAdminUser(users);
  const tokens = login(admin);
  if (!tokens.accessToken) throw new Error(`login failed for ${admin.username}`);
  const seedIds = findSeedTemplateIds(tokens, 30);
  console.log(`setup: ${seedIds.length} template id sẵn sàng cho GET stress`);
  return { tokens, seedIds };
}

export default function ({ tokens, seedIds }) {
  // 90% iteration GET valid, 10% GET id không tồn tại để đo error path
  const useInvalid = randomIntBetween(0, 9) === 0;
  if (useInvalid) {
    const res = http.get(`${TEMPLATES_URL}/999999999`,
      authParams(tokens, { tags: { name: 'templates_not_found' } }));
    check(res, { 'not-found: 404': (r) => r.status === 404 });
  } else {
    const id = seedIds[randomIntBetween(0, seedIds.length - 1)];
    const res = http.get(`${TEMPLATES_URL}/${id}`,
      authParams(tokens, { tags: { name: 'templates_get' } }));
    check(res, {
      'get: 200':         (r) => r.status === 200,
      'get: id matches':  (r) => (r.json('id') ?? r.json('data.id')) === id,
    });
  }

  sleep(randomIntBetween(1, 2));
}

export const handleSummary = buildSummary('templates-get-stress');
