/**
 * Smoke test — PUT /v1/templates/{id}
 *
 * Strategy:
 *   - setup() lấy 1 seed template, snapshot (name/description/tags)
 *   - Mỗi iteration PUT với name/description/tags mới
 *   - teardown() restore lại snapshot ban đầu
 *
 * Chạy: k6 run tests/templates/update.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';

import { login, authParams } from '../../../lib/auth.js';
import { buildSummary } from '../../../lib/report.js';
import {
  getAdminUser,
  findSeedTemplateIds,
  snapshotTemplate,
  restoreTemplate,
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
    'http_req_duration{name:templates_update}': ['p(95)<1000'],
  },
};

export function setup() {
  const admin = getAdminUser(users);
  const tokens = login(admin);
  if (!tokens.accessToken) throw new Error(`login failed for ${admin.username}`);

  // Pick 1 seed template làm target
  const seedIds = findSeedTemplateIds(tokens, 30);
  const targetId = seedIds[0];
  const snapshot = snapshotTemplate(tokens, targetId);
  console.log(`setup: target=${targetId} ("${snapshot.name}") — sẽ restore ở teardown`);

  return { tokens, targetId, snapshot };
}

export default function ({ tokens, targetId }) {
  const payload = JSON.stringify({
    name: `[smoke-update] ${__VU}-${__ITER}-${Date.now()}`,
    description: 'Bị overwrite bởi smoke test',
    tags: ['_smoke_update'],
  });

  const res = http.put(`${TEMPLATES_URL}/${targetId}`, payload,
    authParams(tokens, { tags: { name: 'templates_update' } }));

  check(res, {
    'update: 200': (r) => r.status === 200,
    'update: name reflected': (r) => {
      const n = r.json('name') ?? r.json('data.name');
      return typeof n === 'string' && n.startsWith('[smoke-update]');
    },
  });

  sleep(1);
}

export function teardown({ tokens, snapshot }) {
  console.log(`teardown: restore template ${snapshot.id} ← "${snapshot.name}"`);
  const res = restoreTemplate(tokens, snapshot);
  if (res.status !== 200) {
    console.error(`teardown: restore failed HTTP ${res.status}: ${(res.body || '').slice(0, 200)}`);
  } else {
    console.log(`teardown: restore OK`);
  }
}

export const handleSummary = buildSummary('templates-update-smoke');
