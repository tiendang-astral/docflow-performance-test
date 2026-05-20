/**
 * Smoke test — GET /v1/rules (list + filter + search)
 *
 * Read-only → KHÔNG có teardown.
 *
 * Chạy: k6 run tests/rules/smoke/list.js
 */

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { SharedArray } from 'k6/data';

import { login, authParams } from '../../../lib/auth.js';
import { buildSummary } from '../../../lib/report.js';
import { getAdminUser, RULES_URL } from '../../../lib/rules-helper.js';

const users = new SharedArray('users', () =>
  JSON.parse(open('../../../data/seed/users.json'))
);

export const options = {
  vus: 1,
  iterations: 1,
  duration: '10s',
  thresholds: {
    checks: ['rate>0.99'],
    'http_req_duration{name:rules_list}':        ['p(95)<800'],
    'http_req_duration{name:rules_list_own}':    ['p(95)<800'],
    'http_req_duration{name:rules_list_public}': ['p(95)<800'],
  },
};

export function setup() {
  const admin = getAdminUser(users);
  const tokens = login(admin);
  if (!tokens.accessToken) throw new Error(`login failed for ${admin.username}`);
  return { tokens };
}

export default function ({ tokens }) {
  group('GET /v1/rules — variants', () => {
    // 1) List cơ bản
    {
      const res = http.get(`${RULES_URL}?page=1&size=10`,
        authParams(tokens, { tags: { name: 'rules_list' } }));
      check(res, {
        'list: 200': (r) => r.status === 200,
        'list: items is array': (r) =>
          Array.isArray(r.json('items') ?? r.json('data')),
      });
    }

    // 2) Search by name (seed rules đều có "Quy tắc" prefix)
    {
      const res = http.get(
        `${RULES_URL}?search=${encodeURIComponent('Quy tắc')}&size=20`,
        authParams(tokens, { tags: { name: 'rules_list' } })
      );
      check(res, {
        'search: 200': (r) => r.status === 200,
        'search: ≥1 result': (r) => {
          const items = r.json('items') ?? r.json('data') ?? [];
          return Array.isArray(items) && items.length >= 1;
        },
      });
    }

    // 3) source=own
    {
      const res = http.get(`${RULES_URL}?source=own&size=20`,
        authParams(tokens, { tags: { name: 'rules_list_own' } }));
      check(res, {
        'source=own: 200': (r) => r.status === 200,
        'source=own: items is array': (r) =>
          Array.isArray(r.json('items') ?? r.json('data')),
      });
    }

    // 4) source=public
    {
      const res = http.get(`${RULES_URL}?source=public&size=20`,
        authParams(tokens, { tags: { name: 'rules_list_public' } }));
      check(res, {
        'source=public: 200': (r) => r.status === 200,
        'source=public: items is array': (r) =>
          Array.isArray(r.json('items') ?? r.json('data')),
      });
    }

    // 5) Filter severity=error
    {
      const res = http.get(`${RULES_URL}?severity=error&size=20`,
        authParams(tokens, { tags: { name: 'rules_list' } }));
      check(res, {
        'severity-filter: 200': (r) => r.status === 200,
      });
    }

    // 6) Empty result — search keyword không có
    {
      const res = http.get(
        `${RULES_URL}?search=${encodeURIComponent('__no_such_rule_xyz__')}&size=10`,
        authParams(tokens, { tags: { name: 'rules_list' } })
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

export const handleSummary = buildSummary('rules-list-smoke');
