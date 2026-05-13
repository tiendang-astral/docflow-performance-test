/**
 * Luồng 01 — Đăng nhập và chọn phòng ban
 *
 * Steps:
 *   01  POST /api/v1/auth/login
 *   02  GET  /api/v1/auth/me
 *   03  GET  /api/v1/departments
 *   04  GET  /api/v1/departments/{id}
 *   05  POST /api/v1/auth/logout
 */

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { BASE_URL, login, authParams } from '../lib/auth.js';

export default function runFlow(users) {
  const user = users[__VU % users.length];

  let tokens;
  group('01-login', () => {
    tokens = login(user);
  });

  if (!tokens?.accessToken) {
    sleep(1);
    return;
  }

  group('02-get-me', () => {
    const res = http.get(
      `${BASE_URL}/v1/auth/me`,
      authParams(tokens, { tags: { name: 'get_me' } })
    );
    check(res, {
      'get me: status 200': (r) => r.status === 200,
      'get me: has username': (r) => r.json('username') !== undefined,
    });
  });
  sleep(1);

  let departmentId;
  group('03-list-departments', () => {
    const res = http.get(
      `${BASE_URL}/v1/departments?page=1&size=10`,
      authParams(tokens, { tags: { name: 'list_departments' } })
    );
    check(res, {
      'list departments: status 200': (r) => r.status === 200,
      'list departments: has items': (r) => Array.isArray(r.json('items')),
    });
    const items = res.json('items');
    if (items && items.length > 0) {
      departmentId = items[0].id;
    }
  });
  sleep(1);

  if (departmentId) {
    group('04-get-department-detail', () => {
      const res = http.get(
        `${BASE_URL}/v1/departments/${departmentId}`,
        authParams(tokens, { tags: { name: 'get_department' } })
      );
      check(res, {
        'get department: status 200': (r) => r.status === 200,
        'get department: has id': (r) => r.json('id') !== undefined,
        'get department: has name': (r) => r.json('name') !== undefined,
      });
    });
    sleep(1);
  }

  group('05-logout', () => {
    const res = http.post(
      `${BASE_URL}/v1/auth/logout`,
      null,
      authParams(tokens, { tags: { name: 'logout' } })
    );
    check(res, { 'logout: status 200': (r) => r.status === 200 });
  });
}
