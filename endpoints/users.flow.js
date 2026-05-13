/**
 * Endpoint Group: users — User Management (Admin Only)
 *
 * Steps:
 *   01  POST /api/v1/auth/login              — đăng nhập với quyền admin
 *   02  GET  /api/v1/users                   — danh sách user
 *   03  POST /api/v1/users                   — tạo user mới
 *   04  GET  /api/v1/users/{user_id}         — xem chi tiết user
 *   05  PUT  /api/v1/users/{user_id}         — cập nhật user
 *   06  POST /api/v1/users/{user_id}/deactivate — vô hiệu hoá user
 *   07  POST /api/v1/users/{user_id}/activate   — kích hoạt lại user
 *   08  DELETE /api/v1/users/{user_id}       — xoá user
 */

import http from 'k6/http';
import { check, group } from 'k6';
import { BASE_URL, login, authParams } from '../lib/auth.js';
import { randomSleep, getUserByRole } from '../lib/utils.js';

export default function runFlow(users) {
  const user = getUserByRole(users, 'admin');

  let tokens;
  group('01-login', () => {
    tokens = login(user);
  });

  if (!tokens?.accessToken) {
    randomSleep(1, 2);
    return;
  }

  // 02 — GET /users
  group('02-list-users', () => {
    const res = http.get(
      `${BASE_URL}/v1/users?page=1&size=10`,
      authParams(tokens, { tags: { name: 'list_users' } })
    );
    check(res, {
      'list_users: status 200': (r) => r.status === 200,
      'list_users: has items': (r) => Array.isArray(r.json('items')),
    });
  });
  randomSleep(1, 2);

  // 03 — POST /users
  let createdUserId;
  group('03-create-user', () => {
    const payload = {
      username: `lt-ep-u-${__VU}-${__ITER}-${Date.now()}`,
      email: `lt.ep.${__VU}.${__ITER}@test.local`,
      full_name: 'EP Test User',
      role: 'user',
      password: 'LoadTest@123',
    };
    const res = http.post(
      `${BASE_URL}/v1/users`,
      JSON.stringify(payload),
      authParams(tokens, { tags: { name: 'create_user' } })
    );
    if (res.status !== 200 && res.status !== 201) {
      console.error(`[create_user] HTTP ${res.status}: ${res.body}`);
    }
    check(res, {
      'create_user: status 2xx': (r) => r.status === 200 || r.status === 201,
      'create_user: has id': (r) => r.json('id') !== undefined,
    });
    createdUserId = res.json('id') ?? null;
  });
  randomSleep(1, 2);

  if (!createdUserId) {
    randomSleep(1, 2);
    return;
  }

  // 04 — GET /users/{user_id}
  group('04-get-user', () => {
    const res = http.get(
      `${BASE_URL}/v1/users/${createdUserId}`,
      authParams(tokens, { tags: { name: 'get_user' } })
    );
    check(res, {
      'get_user: status 200': (r) => r.status === 200,
      'get_user: has id': (r) => r.json('id') !== undefined,
    });
  });
  randomSleep(1, 2);

  // 05 — PUT /users/{user_id}
  group('05-update-user', () => {
    const payload = { full_name: 'EP Test User Updated' };
    const res = http.put(
      `${BASE_URL}/v1/users/${createdUserId}`,
      JSON.stringify(payload),
      authParams(tokens, { tags: { name: 'update_user' } })
    );
    if (res.status !== 200) {
      console.error(`[update_user] HTTP ${res.status}: ${res.body}`);
    }
    check(res, {
      'update_user: status 200': (r) => r.status === 200,
      'update_user: has id': (r) => r.json('id') !== undefined,
    });
  });
  randomSleep(1, 2);

  // 06 — POST /users/{user_id}/deactivate
  group('06-deactivate-user', () => {
    const res = http.post(
      `${BASE_URL}/v1/users/${createdUserId}/deactivate`,
      JSON.stringify({}),
      authParams(tokens, { tags: { name: 'deactivate_user' } })
    );
    check(res, {
      'deactivate_user: status 200': (r) => r.status === 200,
    });
  });
  randomSleep(1, 2);

  // 07 — POST /users/{user_id}/activate
  group('07-activate-user', () => {
    const res = http.post(
      `${BASE_URL}/v1/users/${createdUserId}/activate`,
      JSON.stringify({}),
      authParams(tokens, { tags: { name: 'activate_user' } })
    );
    check(res, {
      'activate_user: status 200': (r) => r.status === 200,
    });
  });
  randomSleep(1, 2);

  // 08 — DELETE /users/{user_id}
  group('08-delete-user', () => {
    const res = http.del(
      `${BASE_URL}/v1/users/${createdUserId}`,
      null,
      authParams(tokens, { tags: { name: 'delete_user' } })
    );
    check(res, {
      'delete_user: status 200': (r) => r.status === 200,
    });
  });
  randomSleep(1, 3);
}
