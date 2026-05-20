/**
 * Smoke test — DELETE /v1/templates/{id}
 *
 * Strategy: KHÔNG xóa seed template thật. Thay vào đó setup() tạo trước N "doomed"
 * template; mỗi iteration xóa 1 cái. teardown() dọn nốt cái nào còn sót.
 *
 * Chạy: k6 run tests/templates/delete.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';

import { login, authParams } from '../../../lib/auth.js';
import { buildSummary } from '../../../lib/report.js';
import {
  getAdminUser,
  createTemplate,
  deleteTemplate,
  SAMPLE_FIELDS,
  TEMPLATES_URL,
} from '../../../lib/templates-helper.js';

const users = new SharedArray('users', () =>
  JSON.parse(open('../../../data/seed/users.json'))
);

const DOOMED_COUNT = 30; // đủ cho ~30 iter ở 1 VU × 10s

export const options = {
  vus: 1,
  iterations: 1,
  duration: '10s',
  thresholds: {
    checks: ['rate>0.99'],
    'http_req_duration{name:templates_delete}':       ['p(95)<1000'],
    'http_req_duration{name:templates_verify_gone}':  ['p(95)<500'],
  },
};

export function setup() {
  const admin = getAdminUser(users);
  const tokens = login(admin);
  if (!tokens.accessToken) throw new Error(`login failed for ${admin.username}`);

  const runId = `_smoke_doomed_${Date.now()}`;
  console.log(`setup: creating ${DOOMED_COUNT} doomed templates (tag=${runId})...`);
  const doomedIds = [];
  for (let i = 0; i < DOOMED_COUNT; i++) {
    try {
      const id = createTemplate(tokens, {
        name: `${runId}_${i}`,
        description: 'Doomed template — sẽ bị DELETE bởi smoke test',
        tags: ['_smoke', runId],
        fields: SAMPLE_FIELDS,
      });
      if (id != null) doomedIds.push(id);
    } catch (e) {
      console.error(`setup: tạo doomed #${i} thất bại: ${e.message}`);
    }
  }
  console.log(`setup: tạo được ${doomedIds.length} doomed templates`);
  return { tokens, doomedIds };
}

export default function ({ tokens, doomedIds }) {
  // 1 VU smoke → __ITER là index global duy nhất
  const idx = __ITER;
  if (idx >= doomedIds.length) {
    // Hết doomed → skip (test đã chạy hết)
    sleep(1);
    return;
  }
  const id = doomedIds[idx];

  // DELETE
  const del = http.del(`${TEMPLATES_URL}/${id}`, null,
    authParams(tokens, { tags: { name: 'templates_delete' } }));
  check(del, {
    'delete: 200': (r) => r.status === 200,
  });

  // Verify đã xóa
  const get = http.get(`${TEMPLATES_URL}/${id}`,
    authParams(tokens, { tags: { name: 'templates_verify_gone' } }));
  check(get, {
    'verify: 404': (r) => r.status === 404,
  });

  sleep(1);
}

export function teardown({ tokens, doomedIds }) {
  console.log(`teardown: cleanup doomed templates còn sót...`);
  let stillExisting = 0;
  let cleaned = 0;
  for (const id of doomedIds) {
    const d = deleteTemplate(tokens, id);
    if (d.status === 200) {
      cleaned++;
      stillExisting++;
    }
    // 404 = đã bị test xóa trước rồi → bỏ qua
  }
  console.log(`teardown: cleaned=${cleaned} (số doomed còn sót khi test kết thúc)`);
}

export const handleSummary = buildSummary('templates-delete-smoke');
