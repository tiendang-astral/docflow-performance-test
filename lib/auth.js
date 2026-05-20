import http from 'k6/http';
import { check } from 'k6';

export const BASE_URL = __ENV.BASE_URL || 'http://localhost:29002/api';
// ROOT_URL = BASE_URL bỏ phần đuôi /api — dùng cho /health, /metrics, /
export const ROOT_URL = BASE_URL.replace(/\/api\/?$/, '');

/**
 * Login flow:
 *   1. POST /auth/login — lấy access_token + refresh_token
 *   2. GET  /auth/csrf  — lấy docai_csrf_token cho authenticated POST requests
 *
 * Trả về { accessToken, refreshToken, csrfToken }.
 */
export function login(user) {
  const res = http.post(
    `${BASE_URL}/v1/auth/login`,
    JSON.stringify({ username: user.username, password: user.password }),
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { name: 'login' },
    }
  );

  if (res.status !== 200) {
    console.error(`[login] ${user.username} → HTTP ${res.status}: ${res.body}`);
  }

  check(res, {
    'login: status 200': (r) => r.status === 200,
    'login: has access_token': (r) => r.json('access_token') != null,
  });

  const body = res.json() ?? {};
  const accessToken  = body.access_token  ?? '';
  const refreshToken = body.refresh_token ?? '';

  if (!accessToken) return { accessToken: '', refreshToken: '', csrfToken: '' };

  // Lấy CSRF token cho các authenticated POST/PUT/DELETE
  const csrfCookieParts = [`docai_access_token=${accessToken}`];
  if (refreshToken) csrfCookieParts.push(`docai_refresh_token=${refreshToken}`);

  const csrfRes = http.get(`${BASE_URL}/v1/auth/csrf`, {
    headers: { Cookie: csrfCookieParts.join('; ') },
    tags: { name: 'csrf' },
  });
  const csrfToken = (csrfRes.cookies['docai_csrf_token'] ?? [])[0]?.value ?? '';

  return { accessToken, refreshToken, csrfToken };
}

/**
 * Build k6 request params gửi auth qua Cookie header.
 * Tự động thêm X-CSRF-Token header nếu có csrfToken (double-submit protection).
 * @param {{ accessToken: string, refreshToken: string, csrfToken: string }} tokens
 * @param {object} [extra]  – params bổ sung, vd { tags: { name: 'foo' } }
 */
export function authParams(tokens, extra = {}) {
  const parts = [];
  if (tokens.accessToken)  parts.push(`docai_access_token=${tokens.accessToken}`);
  if (tokens.refreshToken) parts.push(`docai_refresh_token=${tokens.refreshToken}`);
  if (tokens.csrfToken)    parts.push(`docai_csrf_token=${tokens.csrfToken}`);

  const headers = {
    'Content-Type': 'application/json',
    Cookie: parts.join('; '),
  };
  if (tokens.csrfToken) headers['X-CSRF-Token'] = tokens.csrfToken;

  return { headers, ...extra };
}
