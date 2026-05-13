/**
 * Luồng 05 — Tạo hồ sơ và mở canvas
 *
 * Steps:
 *   01  POST /api/v1/auth/login              — đăng nhập
 *   02  GET  /api/v1/dossiers                — xem danh sách hồ sơ
 *   03  POST /api/v1/dossiers                — tạo hồ sơ mới
 *   04  GET  /api/v1/dossiers/{id}           — xem chi tiết hồ sơ
 *   05  PUT  /api/v1/dossiers/{id}           — đổi tên / thêm tag hồ sơ
 *   06  GET  /api/v2/dossiers/{id}/graph     — mở canvas
 *   07  PUT  /api/v2/dossiers/{id}/graph     — lưu thiết kế canvas
 *   08  DELETE /api/v1/dossiers/{id}         — xoá hồ sơ (tự dọn dẹp)
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
      name: `LT-HoSo-VU${__VU}-I${__ITER}-${Date.now()}`,
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
      name: `LT-HoSo-VU${__VU}-I${__ITER}-Updated`,
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

  group('06-get-canvas', () => {
    const res = http.get(
      `${BASE_URL}/v2/dossiers/${dossierId}/graph`,
      authParams(tokens, { tags: { name: 'get_canvas' } })
    );
    check(res, {
      'get canvas: status 200': (r) => r.status === 200,
      'get canvas: has dossier_id': (r) => r.json('dossier_id') !== undefined,
    });
  });
  randomSleep(1, 2);

  group('07-save-canvas', () => {
    const graphData = JSON.stringify({ nodes: [], edges: [] });
    const payload = { graph_data: graphData };
    const res = http.put(
      `${BASE_URL}/v2/dossiers/${dossierId}/graph`,
      JSON.stringify(payload),
      authParams(tokens, { tags: { name: 'save_canvas' } })
    );
    if (res.status !== 200) {
      console.error(`[save_canvas] HTTP ${res.status}: ${res.body}`);
    }
    check(res, {
      'save canvas: status 200': (r) => r.status === 200,
      'save canvas: has dossier_id': (r) => r.json('dossier_id') !== undefined,
    });
  });
  randomSleep(1, 2);

  group('08-delete-dossier', () => {
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
