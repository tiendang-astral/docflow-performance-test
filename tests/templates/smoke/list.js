/**
 * Smoke test — GET /v1/templates (list + filter + search)
 *
 * Read-only → KHÔNG có teardown restore.
 *
 * Chạy: k6 run tests/templates/list.js
 */

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { SharedArray } from 'k6/data';

import { login, authParams } from '../../../lib/auth.js';
import { buildSummary } from '../../../lib/report.js';
import { getAdminUser, TEMPLATES_URL } from '../../../lib/templates-helper.js';

const users = new SharedArray('users', () =>
  JSON.parse(open('../../../data/seed/users.json'))
);

export const options = {
  vus: 1,
  iterations: 1,
  duration: '10s',
  thresholds: {
    checks: ['rate>0.99'],
    'http_req_duration{name:templates_list}':        ['p(95)<800'],
    'http_req_duration{name:templates_list_own}':    ['p(95)<800'],
    'http_req_duration{name:templates_list_public}': ['p(95)<800'],
  },
};

export function setup() {
  const admin = getAdminUser(users);
  const tokens = login(admin);
  if (!tokens.accessToken) throw new Error(`login failed for ${admin.username}`);
  return { tokens };
}

export default function ({ tokens }) {
  group('GET /v1/templates — variants', () => {
    // 1) Bare list, default pagination
    {
      const res = http.get(`${TEMPLATES_URL}?page=1&size=10`,
        authParams(tokens, { tags: { name: 'templates_list' } }));
      check(res, {
        'list: 200': (r) => r.status === 200,
        'list: items is array': (r) =>
          Array.isArray(r.json('items') ?? r.json('data')),
      });
    }

    // 2) Search by name (seed templates đều có "Biểu mẫu" prefix)
    {
      const res = http.get(
        `${TEMPLATES_URL}?search=${encodeURIComponent('Biểu mẫu')}&size=20`,
        authParams(tokens, { tags: { name: 'templates_list' } })
      );
      check(res, {
        'search: 200': (r) => r.status === 200,
        'search: returns matches': (r) => {
          const items = r.json('items') ?? r.json('data') ?? [];
          return Array.isArray(items) && items.length >= 1;
        },
      });
    }

    // 3) source=own — template do chính user hiện tại tạo
    {
      const res = http.get(`${TEMPLATES_URL}?source=own&size=20`,
        authParams(tokens, { tags: { name: 'templates_list_own' } }));
      check(res, {
        'source=own: 200': (r) => r.status === 200,
        'source=own: items is array': (r) =>
          Array.isArray(r.json('items') ?? r.json('data')),
      });
    }

    // 4) source=public — template công khai (do user khác tạo + đã publish)
    {
      const res = http.get(`${TEMPLATES_URL}?source=public&size=20`,
        authParams(tokens, { tags: { name: 'templates_list_public' } }));
      check(res, {
        'source=public: 200': (r) => r.status === 200,
        'source=public: items is array': (r) =>
          Array.isArray(r.json('items') ?? r.json('data')),
      });
    }

    // 5) Empty result — search keyword không có
    {
      const res = http.get(
        `${TEMPLATES_URL}?search=${encodeURIComponent('__no_such_template_xyz__')}&size=10`,
        authParams(tokens, { tags: { name: 'templates_list' } })
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

export const handleSummary = buildSummary('templates-list-smoke');
