/**
 * Form Templates — Form Template Management
 *
 * Steps:
 *   01  POST /api/v1/auth/login                         — đăng nhập
 *   02  GET  /api/v1/form-templates?page=1&size=10      — xem danh sách form template
 *   03  POST /api/v1/form-templates                     — tạo form template mới
 *   04  GET  /api/v1/form-templates/{id}                — xem chi tiết form template
 *   05  PUT  /api/v1/form-templates/{id}                — cập nhật form template
 *   06  GET  /api/v1/form-templates/{id}/content        — xem nội dung form template
 *   07  DELETE /api/v1/form-templates/{id}              — xoá form template (tự dọn dẹp)
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

  let formTemplateId;
  group('03-create-form-template', () => {
    const payload = {
      name: `LT-FormTmpl-${__VU}-${__ITER}-${Date.now()}`,
      description: 'Form template tạo bởi load test',
      tags: ['load-test'],
      fields: [],
    };
    const res = http.post(
      `${BASE_URL}/v1/form-templates`,
      JSON.stringify(payload),
      authParams(tokens, { tags: { name: 'create_form_template' } })
    );
    if (res.status !== 200 && res.status !== 201) {
      console.error(`[create_form_template] HTTP ${res.status}: ${res.body}`);
    }
    check(res, {
      'create form template: status 2xx': (r) => r.status === 200 || r.status === 201,
      'create form template: has id': (r) => r.json('id') !== undefined,
    });
    formTemplateId = res.json('id') ?? null;
  });
  randomSleep(1, 2);

  if (!formTemplateId) {
    randomSleep(1, 2);
    return;
  }

  group('04-get-form-template', () => {
    const res = http.get(
      `${BASE_URL}/v1/form-templates/${formTemplateId}`,
      authParams(tokens, { tags: { name: 'get_form_template' } })
    );
    check(res, {
      'get form template: status 200': (r) => r.status === 200,
      'get form template: has id': (r) => r.json('id') !== undefined,
    });
  });
  randomSleep(1, 2);

  group('05-update-form-template', () => {
    const payload = {
      name: `LT-FormTmpl-Updated-${__VU}-${__ITER}`,
    };
    const res = http.put(
      `${BASE_URL}/v1/form-templates/${formTemplateId}`,
      JSON.stringify(payload),
      authParams(tokens, { tags: { name: 'update_form_template' } })
    );
    if (res.status !== 200) {
      console.error(`[update_form_template] HTTP ${res.status}: ${res.body}`);
    }
    check(res, {
      'update form template: status 200': (r) => r.status === 200,
      'update form template: has id': (r) => r.json('id') !== undefined,
    });
  });
  randomSleep(1, 2);

  group('06-get-content', () => {
    const res = http.get(
      `${BASE_URL}/v1/form-templates/${formTemplateId}/content`,
      authParams(tokens, { tags: { name: 'form_template_content' } })
    );
    check(res, {
      'get form template content: status 200': (r) => r.status === 200,
    });
  });
  randomSleep(1, 2);

  group('07-delete-form-template', () => {
    const res = http.del(
      `${BASE_URL}/v1/form-templates/${formTemplateId}`,
      null,
      authParams(tokens, { tags: { name: 'delete_form_template' } })
    );
    check(res, {
      'delete form template: status 200': (r) => r.status === 200,
    });
  });
  randomSleep(1, 3);
}
