/**
 * Dossier Export — Dossier Export/Import
 *
 * Steps:
 *   01  POST /api/v1/auth/login              — đăng nhập
 *   02  POST /api/v1/dossiers               — tạo hồ sơ để test export
 *   03  GET  /api/v2/dossiers/{id}/export   — export hồ sơ
 *   04  DELETE /api/v1/dossiers/{id}        — xoá hồ sơ (tự dọn dẹp)
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

  let dossierId;
  group('02-create-dossier', () => {
    const payload = {
      name: `LT-Export-${__VU}-${__ITER}-${Date.now()}`,
      description: 'Hồ sơ để test export',
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

  group('03-export-dossier', () => {
    const res = http.get(
      `${BASE_URL}/v2/dossiers/${dossierId}/export`,
      authParams(tokens, { tags: { name: 'export_dossier' } })
    );
    if (res.status !== 200) {
      console.error(`[export_dossier] HTTP ${res.status}: ${res.body}`);
    }
    check(res, {
      'export dossier: status 200': (r) => r.status === 200,
    });
  });
  randomSleep(1, 2);

  group('04-delete-dossier', () => {
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
