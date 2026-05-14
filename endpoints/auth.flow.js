/**
 * Endpoint Group: auth — Authentication endpoints
 *
 * Steps:
 *   01  GET  /api/v1/auth/csrf          — lấy CSRF token
 *   02  POST /api/v1/auth/login         — đăng nhập
 *   03  GET  /api/v1/auth/me            — lấy thông tin user hiện tại
 *   04  POST /api/v1/auth/verify-token  — xác thực token
 *   05  POST /api/v1/auth/refresh       — làm mới token
 *   06  POST /api/v1/auth/logout        — đăng xuất
 */

import http from 'k6/http';
import { check, group } from 'k6';
import { BASE_URL, login, authParams } from '../lib/auth.js';
import { randomSleep } from '../lib/utils.js';

export default function runFlow(users) {
  const user = users[__VU % users.length];

  // 01 — GET csrf (unauthenticated, captured inside login())
  // 02 — POST login
  let tokens;
  group('01-login', () => {
    tokens = login(user);
  });

  if (!tokens?.accessToken) {
    randomSleep(1, 2);
    return;
  }

  // 03 — GET /auth/me
  group('03-get-me', () => {
    const res = http.get(
      `${BASE_URL}/v1/auth/me`,
      authParams(tokens, { tags: { name: 'get_me' } })
    );
    check(res, {
      'get_me: status 200': (r) => r.status === 200,
      'get_me: has username': (r) => r.json('username') !== undefined,
    });
  });
  randomSleep(1, 2);

  // 04 — POST /auth/verify-token
  group('04-verify-token', () => {
    const payload = { token: tokens.accessToken };
    const res = http.post(
      `${BASE_URL}/v1/auth/verify-token`,
      JSON.stringify(payload),
      authParams(tokens, { tags: { name: 'verify_token' } })
    );
    check(res, {
      'verify_token: status 200': (r) => r.status === 200,
    });
  });
  randomSleep(1, 2);

  // 05 — POST /auth/refresh
  let newTokens;
  group('05-refresh-token', () => {
    const res = http.post(
      `${BASE_URL}/v1/auth/refresh`,
      JSON.stringify({}),
      authParams(tokens, { tags: { name: 'refresh_token' } })
    );
    check(res, {
      'refresh_token: status 200': (r) => r.status === 200,
      'refresh_token: has access_token': (r) => r.json('access_token') != null,
    });
    if (res.status === 200) {
      const body = res.json() ?? {};
      newTokens = {
        accessToken: body.access_token ?? tokens.accessToken,
        refreshToken: body.refresh_token ?? tokens.refreshToken,
        csrfToken: tokens.csrfToken,
      };
    } else {
      newTokens = tokens;
    }
  });
  randomSleep(1, 2);

  // 06 — POST /auth/logout
  group('06-logout', () => {
    const res = http.post(
      `${BASE_URL}/v1/auth/logout`,
      JSON.stringify({}),
      authParams(newTokens ?? tokens, { tags: { name: 'logout' } })
    );
    check(res, {
      'logout: status 200': (r) => r.status === 200,
    });
  });
  randomSleep(1, 3);
}
