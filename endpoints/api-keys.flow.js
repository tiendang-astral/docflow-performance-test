/**
 * API Keys — API Keys Management
 *
 * Steps:
 *   01  POST /api/v1/auth/login           — đăng nhập
 *   02  GET  /api/v1/api-keys             — xem danh sách API keys
 *   03  POST /api/v1/api-keys             — tạo API key mới
 *   04  DELETE /api/v1/api-keys/{id}      — xoá API key (tự dọn dẹp)
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

  group('02-list-api-keys', () => {
    const res = http.get(
      `${BASE_URL}/v1/api-keys`,
      authParams(tokens, { tags: { name: 'list_api_keys' } })
    );
    check(res, {
      'list api-keys: status 200': (r) => r.status === 200,
    });
  });
  randomSleep(1, 2);

  let keyId;
  group('03-create-api-key', () => {
    const payload = {
      name: `LT-Key-${__VU}-${__ITER}-${Date.now()}`,
      expires_in_days: 30,
    };
    const res = http.post(
      `${BASE_URL}/v1/api-keys`,
      JSON.stringify(payload),
      authParams(tokens, { tags: { name: 'create_api_key' } })
    );
    if (res.status !== 200 && res.status !== 201) {
      console.error(`[create_api_key] HTTP ${res.status}: ${res.body}`);
    }
    check(res, {
      'create api-key: status 2xx': (r) => r.status === 200 || r.status === 201,
      'create api-key: has id': (r) => r.json('id') !== undefined,
    });
    keyId = res.json('id') ?? null;
  });
  randomSleep(1, 2);

  if (!keyId) {
    randomSleep(1, 2);
    return;
  }

  group('04-delete-api-key', () => {
    const res = http.del(
      `${BASE_URL}/v1/api-keys/${keyId}`,
      null,
      authParams(tokens, { tags: { name: 'delete_api_key' } })
    );
    check(res, {
      'delete api-key: status 200': (r) => r.status === 200,
    });
  });
  randomSleep(1, 3);
}
