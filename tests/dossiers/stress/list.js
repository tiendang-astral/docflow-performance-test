/**
 * Stress test — GET /v1/dossiers (list + filter + search)
 *
 * Chạy:
 *   k6 run tests/dossiers/stress/list.js
 *   k6 run -e MAX_VU=20 tests/dossiers/stress/list.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';

import { login, authParams } from '../../../lib/auth.js';
import { stages } from '../../../lib/stages.js';
import { buildSummary } from '../../../lib/report.js';
import { getAdminUser, DOSSIERS_URL } from '../../../lib/dossiers-helper.js';
import { randomIntBetween } from '../../../lib/utils.js';

const users = new SharedArray('users', () =>
  JSON.parse(open('../../../data/seed/users.json'))
);

export const options = {
  stages: stages.stress,
  thresholds: {
    checks: ['rate>0.95'],
    http_req_failed: ['rate<0.05'],
    'http_req_duration{name:dossiers_list}':         ['p(95)<2500'],
    'http_req_duration{name:dossiers_list_draft}':   ['p(95)<2500'],
    'http_req_duration{name:dossiers_list_private}': ['p(95)<2500'],
    'http_req_duration{name:dossiers_search}':       ['p(95)<3000'],
  },
};

export function setup() {
  const admin = getAdminUser(users);
  const tokens = login(admin);
  if (!tokens.accessToken) throw new Error(`login failed for ${admin.username}`);
  return { tokens };
}

export default function ({ tokens }) {
  const variant = randomIntBetween(0, 4);

  if (variant === 0) {
    const page = randomIntBetween(1, 3);
    const res = http.get(`${DOSSIERS_URL}?page=${page}&size=20`,
      authParams(tokens, { tags: { name: 'dossiers_list' } }));
    check(res, { 'list: 200': (r) => r.status === 200 });
  } else if (variant === 1) {
    const status = ['draft', 'processing', 'ready', 'completed'][randomIntBetween(0, 3)];
    const res = http.get(`${DOSSIERS_URL}?status=${status}&size=20`,
      authParams(tokens, { tags: { name: 'dossiers_list_draft' } }));
    check(res, { 'status-filter: 200': (r) => r.status === 200 });
  } else if (variant === 2) {
    const vis = ['private', 'public'][randomIntBetween(0, 1)];
    const res = http.get(`${DOSSIERS_URL}?visibility=${vis}&size=20`,
      authParams(tokens, { tags: { name: 'dossiers_list_private' } }));
    check(res, { 'visibility-filter: 200': (r) => r.status === 200 });
  } else if (variant === 3) {
    const keywords = ['Hồ sơ', 'Hợp đồng', 'Hóa đơn', 'Nhân sự'];
    const kw = keywords[randomIntBetween(0, keywords.length - 1)];
    const res = http.get(
      `${DOSSIERS_URL}?search=${encodeURIComponent(kw)}&size=20`,
      authParams(tokens, { tags: { name: 'dossiers_search' } })
    );
    check(res, { 'search: 200': (r) => r.status === 200 });
  } else {
    // Combined filter: status + visibility
    const res = http.get(`${DOSSIERS_URL}?status=draft&visibility=private&size=20`,
      authParams(tokens, { tags: { name: 'dossiers_list' } }));
    check(res, { 'combined: 200': (r) => r.status === 200 });
  }

  sleep(randomIntBetween(1, 3));
}

export const handleSummary = buildSummary('dossiers-list-stress');
