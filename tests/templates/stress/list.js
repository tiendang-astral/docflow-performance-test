/**
 * Stress test — GET /v1/templates (list + filter + search)
 *
 * Read-only → KHÔNG cần teardown restore.
 * Đo throughput khi nhiều VU cùng list/search.
 *
 * Chạy:
 *   k6 run tests/templates/stress/list.js                 # full (~22m, ramp 200 VU)
 *   k6 run -e MAX_VU=20 tests/templates/stress/list.js    # quick (~100s, 20 VU)
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';

import { login, authParams } from '../../../lib/auth.js';
import { stages } from '../../../lib/stages.js';
import { buildSummary } from '../../../lib/report.js';
import { getAdminUser, TEMPLATES_URL } from '../../../lib/templates-helper.js';
import { randomIntBetween } from '../../../lib/utils.js';

const users = new SharedArray('users', () =>
  JSON.parse(open('../../../data/seed/users.json'))
);

export const options = {
  stages: stages.stress,
  thresholds: {
    checks: ['rate>0.95'],
    http_req_failed: ['rate<0.05'],
    'http_req_duration{name:templates_list}':        ['p(95)<2000'],
    'http_req_duration{name:templates_list_own}':    ['p(95)<2000'],
    'http_req_duration{name:templates_list_public}': ['p(95)<2000'],
    'http_req_duration{name:templates_search}':      ['p(95)<2500'],
  },
};

export function setup() {
  const admin = getAdminUser(users);
  const tokens = login(admin);
  if (!tokens.accessToken) throw new Error(`login failed for ${admin.username}`);
  return { tokens };
}

export default function ({ tokens }) {
  // Mỗi iteration chọn ngẫu nhiên 1 trong 4 kiểu query để pha trộn pattern
  const variant = randomIntBetween(0, 3);

  if (variant === 0) {
    const page = randomIntBetween(1, 5);
    const res = http.get(`${TEMPLATES_URL}?page=${page}&size=20`,
      authParams(tokens, { tags: { name: 'templates_list' } }));
    check(res, { 'list: 200': (r) => r.status === 200 });
  } else if (variant === 1) {
    const res = http.get(`${TEMPLATES_URL}?source=own&size=20`,
      authParams(tokens, { tags: { name: 'templates_list_own' } }));
    check(res, { 'list-own: 200': (r) => r.status === 200 });
  } else if (variant === 2) {
    const res = http.get(`${TEMPLATES_URL}?source=public&size=20`,
      authParams(tokens, { tags: { name: 'templates_list_public' } }));
    check(res, { 'list-public: 200': (r) => r.status === 200 });
  } else {
    const keywords = ['Biểu mẫu', 'Hợp đồng', 'Hóa đơn', 'Đơn'];
    const kw = keywords[randomIntBetween(0, keywords.length - 1)];
    const res = http.get(
      `${TEMPLATES_URL}?search=${encodeURIComponent(kw)}&size=20`,
      authParams(tokens, { tags: { name: 'templates_search' } })
    );
    check(res, { 'search: 200': (r) => r.status === 200 });
  }

  sleep(randomIntBetween(1, 3));
}

export const handleSummary = buildSummary('templates-list-stress');
