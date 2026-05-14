/**
 * Endpoint Group: tags — Tag Management
 *
 * Steps:
 *   01  POST /api/v1/auth/login  — đăng nhập
 *   02  GET  /api/v1/tags        — danh sách tag
 *   03  POST /api/v1/tags        — tạo tag mới
 *   04  DELETE /api/v1/tags/{name} — xoá tag
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

  // 02 — GET /tags
  group('02-list-tags', () => {
    const res = http.get(
      `${BASE_URL}/v1/tags`,
      authParams(tokens, { tags: { name: 'list_tags' } })
    );
    check(res, {
      'list_tags: status 200': (r) => r.status === 200,
    });
  });
  randomSleep(1, 2);

  // 03 — POST /tags
  let tagName;
  group('03-create-tag', () => {
    tagName = `lt-tag-${__VU}-${__ITER}-${Date.now()}`;
    const payload = { name: tagName };
    const res = http.post(
      `${BASE_URL}/v1/tags`,
      JSON.stringify(payload),
      authParams(tokens, { tags: { name: 'create_tag' } })
    );
    if (res.status !== 200 && res.status !== 201) {
      console.error(`[create_tag] HTTP ${res.status}: ${res.body}`);
    }
    check(res, {
      'create_tag: status 2xx': (r) => r.status === 200 || r.status === 201,
    });
  });
  randomSleep(1, 2);

  if (!tagName) {
    randomSleep(1, 2);
    return;
  }

  // 04 — DELETE /tags/{name}
  group('04-delete-tag', () => {
    const res = http.del(
      `${BASE_URL}/v1/tags/${encodeURIComponent(tagName)}`,
      null,
      authParams(tokens, { tags: { name: 'delete_tag' } })
    );
    check(res, {
      'delete_tag: status 200': (r) => r.status === 200,
    });
  });
  randomSleep(1, 3);
}
