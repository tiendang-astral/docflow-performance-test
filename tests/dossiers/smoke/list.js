/**
 * Smoke test — GET /v1/dossiers (list + filter + search)
 *
 * Read-only → KHÔNG có teardown.
 * Endpoint không hỗ trợ source filter → dùng status/visibility thay thế.
 *
 * Chạy: k6 run tests/dossiers/smoke/list.js
 */

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { SharedArray } from 'k6/data';

import { login, authParams } from '../../../lib/auth.js';
import { buildSummary } from '../../../lib/report.js';
import { getAdminUser, DOSSIERS_URL } from '../../../lib/dossiers-helper.js';

const users = new SharedArray('users', () =>
  JSON.parse(open('../../../data/seed/users.json'))
);

export const options = {
  vus: 1,
  iterations: 1,
  duration: '10s',
  thresholds: {
    checks: ['rate>0.99'],
    'http_req_duration{name:dossiers_list}':            ['p(95)<1000'],
    'http_req_duration{name:dossiers_list_draft}':      ['p(95)<1000'],
    'http_req_duration{name:dossiers_list_private}':    ['p(95)<1000'],
  },
};

export function setup() {
  const admin = getAdminUser(users);
  const tokens = login(admin);
  if (!tokens.accessToken) throw new Error(`login failed for ${admin.username}`);
  return { tokens };
}

export default function ({ tokens }) {
  group('GET /v1/dossiers — variants', () => {
    // 1) List cơ bản
    {
      const res = http.get(`${DOSSIERS_URL}?page=1&size=10`,
        authParams(tokens, { tags: { name: 'dossiers_list' } }));
      check(res, {
        'list: 200': (r) => r.status === 200,
        'list: items is array': (r) =>
          Array.isArray(r.json('items') ?? r.json('data')),
      });
    }

    // 2) Search by name (seed dossier có "Hồ sơ" prefix)
    {
      const res = http.get(
        `${DOSSIERS_URL}?search=${encodeURIComponent('Hồ sơ')}&size=20`,
        authParams(tokens, { tags: { name: 'dossiers_list' } })
      );
      check(res, {
        'search: 200': (r) => r.status === 200,
        'search: ≥1 result': (r) => {
          const items = r.json('items') ?? r.json('data') ?? [];
          return Array.isArray(items) && items.length >= 1;
        },
      });
    }

    // 3) Filter status=draft
    {
      const res = http.get(`${DOSSIERS_URL}?status=draft&size=20`,
        authParams(tokens, { tags: { name: 'dossiers_list_draft' } }));
      check(res, {
        'status=draft: 200': (r) => r.status === 200,
      });
    }

    // 4) Filter visibility=private
    {
      const res = http.get(`${DOSSIERS_URL}?visibility=private&size=20`,
        authParams(tokens, { tags: { name: 'dossiers_list_private' } }));
      check(res, {
        'visibility=private: 200': (r) => r.status === 200,
      });
    }

    // 5) Empty result — search keyword không có
    {
      const res = http.get(
        `${DOSSIERS_URL}?search=${encodeURIComponent('__no_such_dossier_xyz__')}&size=10`,
        authParams(tokens, { tags: { name: 'dossiers_list' } })
      );
      check(res, {
        'empty-search: 200': (r) => r.status === 200,
        'empty-search: items empty': (r) => {
          const items = r.json('items') ?? r.json('data') ?? [];
          return Array.isArray(items) && items.length === 0;
        },
      });
    }
  });

  sleep(1);
}

export const handleSummary = buildSummary('dossiers-list-smoke');
