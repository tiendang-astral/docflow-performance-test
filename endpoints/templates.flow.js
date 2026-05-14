/**
 * Endpoints — Template Management
 *
 * Steps:
 *   01  POST /api/v1/auth/login                       — đăng nhập
 *   02  GET  /api/v1/templates?page=1&size=10         — danh sách template
 *   03  POST /api/v1/templates                        — tạo template mới
 *   04  GET  /api/v1/templates/{id}                   — xem chi tiết template
 *   05  PUT  /api/v1/templates/{id}                   — cập nhật template
 *   06  GET  /api/v1/templates?status=pending_approval  — danh sách template chờ duyệt
 *   07  GET  /api/v1/templates/tags                   — danh sách tags
 *   08  POST /api/v1/templates/{id}/fields            — thêm field vào template
 *   09  GET  /api/v1/templates/{id}/fields            — danh sách fields của template
 *   10  PATCH /api/v1/templates/{id}/tags             — cập nhật tags của template
 *   11  DELETE /api/v1/templates/{id}                 — xoá template (tự dọn dẹp)
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

  group('02-list-templates', () => {
    const res = http.get(
      `${BASE_URL}/v1/templates?page=1&size=10`,
      authParams(tokens, { tags: { name: 'list_templates' } })
    );
    check(res, {
      'list templates: status 200': (r) => r.status === 200,
      'list templates: has items': (r) => Array.isArray(r.json('items')),
    });
  });
  randomSleep(1, 2);

  let templateId;
  group('03-create-template', () => {
    const payload = {
      name: `LT-Tmpl-${__VU}-${__ITER}-${Date.now()}`,
      description: 'Biểu mẫu tạo bởi load test',
      tags: ['load-test'],
      fields: [],
    };
    const res = http.post(
      `${BASE_URL}/v1/templates`,
      JSON.stringify(payload),
      authParams(tokens, { tags: { name: 'create_template' } })
    );
    if (res.status !== 200 && res.status !== 201) {
      console.error(`[create_template] HTTP ${res.status}: ${res.body}`);
    }
    check(res, {
      'create template: status 2xx': (r) => r.status === 200 || r.status === 201,
      'create template: has id': (r) => r.json('id') !== undefined,
    });
    templateId = res.json('id') ?? null;
  });
  randomSleep(1, 2);

  if (!templateId) {
    randomSleep(1, 2);
    return;
  }

  group('04-get-template', () => {
    const res = http.get(
      `${BASE_URL}/v1/templates/${templateId}`,
      authParams(tokens, { tags: { name: 'get_template' } })
    );
    check(res, {
      'get template: status 200': (r) => r.status === 200,
      'get template: has id': (r) => r.json('id') !== undefined,
    });
  });
  randomSleep(1, 2);

  group('05-update-template', () => {
    const payload = {
      name: `LT-Tmpl-Updated-${__VU}-${__ITER}`,
      description: 'Cập nhật bởi load test',
    };
    const res = http.put(
      `${BASE_URL}/v1/templates/${templateId}`,
      JSON.stringify(payload),
      authParams(tokens, { tags: { name: 'update_template' } })
    );
    if (res.status !== 200) {
      console.error(`[update_template] HTTP ${res.status}: ${res.body}`);
    }
    check(res, {
      'update template: status 200': (r) => r.status === 200,
      'update template: has id': (r) => r.json('id') !== undefined,
    });
  });
  randomSleep(1, 2);

  group('06-list-pending', () => {
    const res = http.get(
      `${BASE_URL}/v1/templates?status=pending_approval`,
      authParams(tokens, { tags: { name: 'list_pending_templates' } })
    );
    check(res, {
      'list pending templates: status 200': (r) => r.status === 200,
    });
  });
  randomSleep(1, 2);

  group('07-list-tags', () => {
    const res = http.get(
      `${BASE_URL}/v1/templates/tags`,
      authParams(tokens, { tags: { name: 'list_template_tags' } })
    );
    check(res, {
      'list template tags: status 200': (r) => r.status === 200,
    });
  });
  randomSleep(1, 2);

  group('08-add-field', () => {
    const payload = {
      field_id: `field_lt_${__VU}_${__ITER}`,
      field_name: 'Trường test',
      field_type: 'text',
      required: false,
    };
    const res = http.post(
      `${BASE_URL}/v1/templates/${templateId}/fields`,
      JSON.stringify(payload),
      authParams(tokens, { tags: { name: 'create_template_field' } })
    );
    if (res.status !== 200 && res.status !== 201) {
      console.error(`[create_template_field] HTTP ${res.status}: ${res.body}`);
    }
    check(res, {
      'add field: status 2xx': (r) => r.status === 200 || r.status === 201,
    });
  });
  randomSleep(1, 2);

  group('09-list-fields', () => {
    const res = http.get(
      `${BASE_URL}/v1/templates/${templateId}/fields`,
      authParams(tokens, { tags: { name: 'list_template_fields' } })
    );
    check(res, {
      'list template fields: status 200': (r) => r.status === 200,
    });
  });
  randomSleep(1, 2);

  group('10-patch-tags', () => {
    const payload = { tags: ['load-test', 'endpoint-test'] };
    const res = http.patch(
      `${BASE_URL}/v1/templates/${templateId}/tags`,
      JSON.stringify(payload),
      authParams(tokens, { tags: { name: 'patch_template_tags' } })
    );
    if (res.status !== 200) {
      console.error(`[patch_template_tags] HTTP ${res.status}: ${res.body}`);
    }
    check(res, {
      'patch template tags: status 200': (r) => r.status === 200,
    });
  });
  randomSleep(1, 2);

  group('11-delete-template', () => {
    const res = http.del(
      `${BASE_URL}/v1/templates/${templateId}`,
      null,
      authParams(tokens, { tags: { name: 'delete_template' } })
    );
    check(res, {
      'delete template: status 200': (r) => r.status === 200,
    });
  });
  randomSleep(1, 3);
}
