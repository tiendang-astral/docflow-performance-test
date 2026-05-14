/**
 * Dossiers — Dossier Management
 *
 * Steps:
 *   01  POST /api/v1/auth/login                      — đăng nhập
 *   02  GET  /api/v1/dossiers?page=1&size=10         — xem danh sách hồ sơ
 *   03  POST /api/v1/dossiers                        — tạo hồ sơ mới
 *   04  GET  /api/v1/dossiers/{id}                   — xem chi tiết hồ sơ
 *   05  PUT  /api/v1/dossiers/{id}                   — cập nhật hồ sơ
 *   06  PATCH /api/v1/dossiers/{id}/visibility       — cập nhật visibility
 *   07  GET  /api/v1/dossiers/{id}/templates         — xem templates của hồ sơ
 *   08  GET  /api/v1/dossiers/{id}/rules             — xem rules của hồ sơ
 *   09  DELETE /api/v1/dossiers/{id}                 — xoá hồ sơ (tự dọn dẹp)
 */

import http from 'k6/http';
import { check, group } from 'k6';
import { BASE_URL, login, authParams } from '../lib/auth.js';
import { randomSleep } from '../lib/utils.js';

export default function runFlow(users) {
  const user = users[__VU % users.length];

  let tokens;
  group('01-login', () => {
    tokens = login(user);
  });

  if (!tokens?.accessToken) {
    randomSleep(1, 2);
    return;
  }

  group('02-list-dossiers', () => {
    const res = http.get(
      `${BASE_URL}/v1/dossiers?page=1&size=10`,
      authParams(tokens, { tags: { name: 'list_dossiers' } })
    );
    check(res, {
      'list dossiers: status 200': (r) => r.status === 200,
      'list dossiers: has items': (r) => Array.isArray(r.json('items')),
    });
  });
  randomSleep(1, 2);

  let dossierId;
  group('03-create-dossier', () => {
    const payload = {
      name: `LT-HoSo-${__VU}-${__ITER}-${Date.now()}`,
      description: 'Hồ sơ tạo bởi load test',
      tags: ['load-test'],
      status: 'draft',
      visibility: 'private',
    };
    const res = http.post(
      `${BASE_URL}/v1/dossiers`,
      JSON.stringify(payload),
      authParams(tokens, { tags: { name: 'create_dossier' } })
    );
    if (res.status !== 200 && res.status !== 201) {
      console.error(`[create_dossier] HTTP ${res.status}: ${res.body}`);
    }
    check(res, {
      'create dossier: status 2xx': (r) => r.status === 200 || r.status === 201,
      'create dossier: has id': (r) => r.json('id') !== undefined,
    });
    dossierId = res.json('id') ?? null;
  });
  randomSleep(1, 2);

  if (!dossierId) {
    randomSleep(1, 2);
    return;
  }

  group('04-get-dossier', () => {
    const res = http.get(
      `${BASE_URL}/v1/dossiers/${dossierId}`,
      authParams(tokens, { tags: { name: 'get_dossier' } })
    );
    check(res, {
      'get dossier: status 200': (r) => r.status === 200,
      'get dossier: has id': (r) => r.json('id') !== undefined,
    });
  });
  randomSleep(1, 2);

  group('05-update-dossier', () => {
    const payload = {
      name: `LT-HoSo-Updated-${__VU}-${__ITER}`,
      description: 'Cập nhật bởi load test',
    };
    const res = http.put(
      `${BASE_URL}/v1/dossiers/${dossierId}`,
      JSON.stringify(payload),
      authParams(tokens, { tags: { name: 'update_dossier' } })
    );
    if (res.status !== 200) {
      console.error(`[update_dossier] HTTP ${res.status}: ${res.body}`);
    }
    check(res, {
      'update dossier: status 200': (r) => r.status === 200,
      'update dossier: has id': (r) => r.json('id') !== undefined,
    });
  });
  randomSleep(1, 2);

  group('06-update-visibility', () => {
    const payload = { visibility: 'public' };
    const res = http.patch(
      `${BASE_URL}/v1/dossiers/${dossierId}/visibility`,
      JSON.stringify(payload),
      authParams(tokens, { tags: { name: 'update_visibility' } })
    );
    if (res.status !== 200) {
      console.error(`[update_visibility] HTTP ${res.status}: ${res.body}`);
    }
    check(res, {
      'update visibility: status 200': (r) => r.status === 200,
    });
  });
  randomSleep(1, 2);

  group('07-get-templates', () => {
    const res = http.get(
      `${BASE_URL}/v1/dossiers/${dossierId}/templates`,
      authParams(tokens, { tags: { name: 'get_dossier_templates' } })
    );
    check(res, {
      'get dossier templates: status 200': (r) => r.status === 200,
    });
  });
  randomSleep(1, 2);

  group('08-get-rules', () => {
    const res = http.get(
      `${BASE_URL}/v1/dossiers/${dossierId}/rules`,
      authParams(tokens, { tags: { name: 'get_dossier_rules' } })
    );
    check(res, {
      'get dossier rules: status 200': (r) => r.status === 200,
    });
  });
  randomSleep(1, 2);

  group('09-delete-dossier', () => {
    const res = http.del(
      `${BASE_URL}/v1/dossiers/${dossierId}`,
      null,
      authParams(tokens, { tags: { name: 'delete_dossier' } })
    );
    check(res, {
      'delete dossier: status 200': (r) => r.status === 200,
    });
  });
  randomSleep(1, 3);
}
