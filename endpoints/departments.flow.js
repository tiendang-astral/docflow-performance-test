/**
 * Endpoint Group: departments — Department Management
 *
 * Steps:
 *   01  POST /api/v1/auth/login                         — đăng nhập với quyền admin
 *   02  GET  /api/v1/departments                        — danh sách phòng ban
 *   03  POST /api/v1/departments                        — tạo phòng ban mới
 *   04  GET  /api/v1/departments/{department_id}        — xem chi tiết phòng ban
 *   05  PUT  /api/v1/departments/{department_id}        — cập nhật phòng ban
 *   06  GET  /api/v1/departments/{department_id}/members — danh sách thành viên
 *   07  DELETE /api/v1/departments/{department_id}      — xoá phòng ban
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

  // 02 — GET /departments
  group('02-list-departments', () => {
    const res = http.get(
      `${BASE_URL}/v1/departments?page=1&size=10`,
      authParams(tokens, { tags: { name: 'list_departments' } })
    );
    check(res, {
      'list_departments: status 200': (r) => r.status === 200,
      'list_departments: has items': (r) => Array.isArray(r.json('items')),
    });
  });
  randomSleep(1, 2);

  // 03 — POST /departments
  let departmentId;
  group('03-create-department', () => {
    const payload = {
      name: `LT-Dept-${__VU}-${__ITER}-${Date.now()}`,
      description: 'Phòng ban tạo bởi load test',
    };
    const res = http.post(
      `${BASE_URL}/v1/departments`,
      JSON.stringify(payload),
      authParams(tokens, { tags: { name: 'create_department' } })
    );
    if (res.status !== 200 && res.status !== 201) {
      console.error(`[create_department] HTTP ${res.status}: ${res.body}`);
    }
    check(res, {
      'create_department: status 2xx': (r) => r.status === 200 || r.status === 201,
      'create_department: has id': (r) => r.json('id') !== undefined,
    });
    departmentId = res.json('id') ?? null;
  });
  randomSleep(1, 2);

  if (!departmentId) {
    randomSleep(1, 2);
    return;
  }

  // 04 — GET /departments/{department_id}
  group('04-get-department', () => {
    const res = http.get(
      `${BASE_URL}/v1/departments/${departmentId}`,
      authParams(tokens, { tags: { name: 'get_department' } })
    );
    check(res, {
      'get_department: status 200': (r) => r.status === 200,
      'get_department: has id': (r) => r.json('id') !== undefined,
    });
  });
  randomSleep(1, 2);

  // 05 — PUT /departments/{department_id}
  group('05-update-department', () => {
    const payload = {
      name: `LT-Dept-${__VU}-${__ITER}-Updated`,
      description: 'Phòng ban được cập nhật bởi load test',
    };
    const res = http.put(
      `${BASE_URL}/v1/departments/${departmentId}`,
      JSON.stringify(payload),
      authParams(tokens, { tags: { name: 'update_department' } })
    );
    if (res.status !== 200) {
      console.error(`[update_department] HTTP ${res.status}: ${res.body}`);
    }
    check(res, {
      'update_department: status 200': (r) => r.status === 200,
      'update_department: has id': (r) => r.json('id') !== undefined,
    });
  });
  randomSleep(1, 2);

  // 06 — GET /departments/{department_id}/members
  group('06-list-members', () => {
    const res = http.get(
      `${BASE_URL}/v1/departments/${departmentId}/members`,
      authParams(tokens, { tags: { name: 'list_members' } })
    );
    check(res, {
      'list_members: status 200': (r) => r.status === 200,
    });
  });
  randomSleep(1, 2);

  // 07 — DELETE /departments/{department_id}
  group('07-delete-department', () => {
    const res = http.del(
      `${BASE_URL}/v1/departments/${departmentId}`,
      null,
      authParams(tokens, { tags: { name: 'delete_department' } })
    );
    check(res, {
      'delete_department: status 200': (r) => r.status === 200,
    });
  });
  randomSleep(1, 3);
}
