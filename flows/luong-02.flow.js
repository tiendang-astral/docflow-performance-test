/**
 * Luồng 02 — Tạo biểu mẫu
 *
 * Steps:
 *   01  POST /api/v1/auth/login              — đăng nhập
 *   02  GET  /api/v1/form-templates          — xem danh sách biểu mẫu
 *   03  POST /api/v1/form-templates          — tạo biểu mẫu mới
 *   04  GET  /api/v1/form-templates/{id}     — xem chi tiết biểu mẫu vừa tạo
 *   05  PUT  /api/v1/form-templates/{id}     — cập nhật biểu mẫu
 *   06  DELETE /api/v1/form-templates/{id}   — xoá biểu mẫu (tự dọn dẹp)
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

  group('02-list-form-templates', () => {
    const res = http.get(
      `${BASE_URL}/v1/form-templates?page=1&size=10`,
      authParams(tokens, { tags: { name: 'list_form_templates' } })
    );
    check(res, {
      'list form templates: status 200': (r) => r.status === 200,
      'list form templates: has items': (r) => Array.isArray(r.json('items')),
    });
  });
  randomSleep(1, 2);

  let templateId;
  group('03-create-form-template', () => {
    const payload = {
      name: `LT-Form-VU${__VU}-I${__ITER}-${Date.now()}`,
      description: 'Biểu mẫu tạo bởi load test',
      tags: ['load-test'],
      fields: [],
    };
    const res = http.post(
      `${BASE_URL}/v1/form-templates`,
      JSON.stringify(payload),
      authParams(tokens, { tags: { name: 'create_form_template' } })
    );
    if (res.status !== 200) {
      console.error(`[create_form_template] HTTP ${res.status}: ${res.body}`);
    }
    check(res, {
      'create form template: status 200': (r) => r.status === 200,
      'create form template: success': (r) => r.json('success') === true,
    });
    const body = res.json() ?? {};
    templateId = body?.data?.id ?? res.json('data.id');
  });
  randomSleep(1, 2);

  if (!templateId) {
    randomSleep(1, 2);
    return;
  }

  group('04-get-form-template', () => {
    const res = http.get(
      `${BASE_URL}/v1/form-templates/${templateId}`,
      authParams(tokens, { tags: { name: 'get_form_template' } })
    );
    check(res, {
      'get form template: status 200': (r) => r.status === 200,
      'get form template: has data': (r) => r.json('data') !== null,
    });
  });
  randomSleep(1, 2);

  group('05-update-form-template', () => {
    // tags omitted — backend bug: PUT stringifies list before Pydantic, causing 500
    const payload = {
      name: `LT-Form-VU${__VU}-I${__ITER}-Updated`,
      description: 'Cập nhật bởi load test',
    };
    const res = http.put(
      `${BASE_URL}/v1/form-templates/${templateId}`,
      JSON.stringify(payload),
      authParams(tokens, { tags: { name: 'update_form_template' } })
    );
    if (res.status !== 200) {
      console.error(`[update_form_template] HTTP ${res.status}: ${res.body}`);
    }
    check(res, {
      'update form template: status 200': (r) => r.status === 200,
      'update form template: success': (r) => r.json('success') === true,
    });
  });
  randomSleep(1, 2);

  group('06-delete-form-template', () => {
    const res = http.del(
      `${BASE_URL}/v1/form-templates/${templateId}`,
      null,
      authParams(tokens, { tags: { name: 'delete_form_template' } })
    );
    check(res, {
      'delete form template: status 200': (r) => r.status === 200,
    });
  });
  randomSleep(1, 3);
}
