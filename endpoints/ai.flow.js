/**
 * Endpoints — AI Draft Generation
 *
 * Steps:
 *   01  POST /api/v1/auth/login                            — đăng nhập
 *   02  POST /api/v1/ai/generate-template-draft            — tạo draft template bằng AI
 *   03  POST /api/v1/ai/generate-rule-draft                — tạo draft quy tắc bằng AI
 *
 * Lưu ý: AI endpoints có thể chậm (>5s), ngưỡng p(95)<10000ms.
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

  group('02-gen-template-draft', () => {
    const payload = {
      text: 'Hóa đơn VAT bao gồm số hóa đơn, ngày, người mua, người bán, tổng tiền',
    };
    const res = http.post(
      `${BASE_URL}/v1/ai/generate-template-draft`,
      JSON.stringify(payload),
      authParams(tokens, { tags: { name: 'ai_template_draft' } })
    );
    if (res.status !== 200 && res.status !== 201) {
      console.error(`[ai_template_draft] HTTP ${res.status}: ${res.body}`);
    }
    check(res, {
      'ai template draft: status 2xx': (r) => r.status === 200 || r.status === 201,
    });
  });
  randomSleep(1, 2);

  group('03-gen-rule-draft', () => {
    const payload = {
      text: 'Ngày hóa đơn không được để trống và phải hợp lệ',
    };
    const res = http.post(
      `${BASE_URL}/v1/ai/generate-rule-draft`,
      JSON.stringify(payload),
      authParams(tokens, { tags: { name: 'ai_rule_draft' } })
    );
    if (res.status !== 200 && res.status !== 201) {
      console.error(`[ai_rule_draft] HTTP ${res.status}: ${res.body}`);
    }
    check(res, {
      'ai rule draft: status 2xx': (r) => r.status === 200 || r.status === 201,
    });
  });
  randomSleep(1, 3);
}
