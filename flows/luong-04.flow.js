/**
 * Luồng 04 — Duyệt biểu mẫu và quy tắc
 *
 * Steps:
 *   01  POST /api/v1/auth/login (user)              — đăng nhập user thường
 *   02  POST /api/v1/rules                           — tạo quy tắc (→ status pending)
 *   03  POST /api/v1/form-templates                  — tạo biểu mẫu (→ status pending)
 *   04  POST /api/v1/auth/login (admin)              — đăng nhập admin
 *   05  GET  /api/v1/rules/pending                   — lấy danh sách quy tắc chờ duyệt
 *   06  PUT  /api/v1/rules/{id}/approve              — duyệt quy tắc
 *   07  GET  /api/v1/templates/pending               — lấy danh sách biểu mẫu chờ duyệt
 *   08  PUT  /api/v1/templates/{id}/approve          — duyệt biểu mẫu
 */

import http from 'k6/http';
import { check, group } from 'k6';
import { BASE_URL, login, authParams } from '../lib/auth.js';
import { randomSleep } from '../lib/utils.js';

export default function runFlow(users) {
  const regularUsers = users.filter((u) => u.role === 'user');
  const adminUsers   = users.filter((u) => u.role === 'admin');
  const regularUser  = regularUsers.length > 0 ? regularUsers[(__VU - 1) % regularUsers.length] : users[0];
  const adminUser    = adminUsers.length  > 0 ? adminUsers[(__VU - 1)  % adminUsers.length]  : users[0];

  // ── Phần 1: User thường tạo rule + template (→ pending) ────────────────────

  let userTokens;
  group('01-login-user', () => {
    userTokens = login(regularUser);
  });

  if (!userTokens?.accessToken) {
    randomSleep(1, 2);
    return;
  }

  let createdRuleId;
  group('02-create-rule', () => {
    const payload = {
      name: `LT-Approve-Rule-VU${__VU}-I${__ITER}-${Date.now()}`,
      description: 'Quy tắc tạo để test duyệt',
      condition: `field("amount") > 0`,
      rule_type: 'prompt',
      severity: 'error',
    };
    const res = http.post(
      `${BASE_URL}/v1/rules`,
      JSON.stringify(payload),
      authParams(userTokens, { tags: { name: 'create_rule' } })
    );
    if (res.status !== 200 && res.status !== 201) {
      console.error(`[create_rule] HTTP ${res.status}: ${res.body}`);
    }
    check(res, {
      'create rule: status 2xx': (r) => r.status === 200 || r.status === 201,
      'create rule: has id': (r) => r.json('id') !== undefined,
    });
    createdRuleId = res.json('id') ?? null;
  });
  randomSleep(1, 2);

  let createdTemplateId;
  group('03-create-template', () => {
    const payload = {
      name: `LT-Approve-Form-VU${__VU}-I${__ITER}-${Date.now()}`,
      description: 'Biểu mẫu tạo để test duyệt',
      fields: [],
    };
    const res = http.post(
      `${BASE_URL}/v1/form-templates`,
      JSON.stringify(payload),
      authParams(userTokens, { tags: { name: 'create_template' } })
    );
    if (res.status !== 200 && res.status !== 201) {
      console.error(`[create_template] HTTP ${res.status}: ${res.body}`);
    }
    check(res, {
      'create template: status 2xx': (r) => r.status === 200 || r.status === 201,
      'create template: success': (r) => r.json('success') === true,
    });
    const body = res.json() ?? {};
    createdTemplateId = body?.data?.id ?? null;
  });
  randomSleep(1, 2);

  // ── Phần 2: Admin duyệt rule + template ────────────────────────────────────

  let adminTokens;
  group('04-login-admin', () => {
    adminTokens = login(adminUser);
  });

  if (!adminTokens?.accessToken) {
    randomSleep(1, 2);
    return;
  }

  group('05-list-pending-rules', () => {
    const res = http.get(
      `${BASE_URL}/v1/rules/pending?page=1&size=10`,
      authParams(adminTokens, { tags: { name: 'list_pending_rules' } })
    );
    check(res, {
      'list pending rules: status 200': (r) => r.status === 200,
      'list pending rules: has items': (r) => Array.isArray(r.json('items')),
    });
    if (!createdRuleId) {
      const items = res.json('items') ?? [];
      createdRuleId = items[0]?.id ?? null;
    }
  });
  randomSleep(1, 2);

  if (createdRuleId) {
    group('06-approve-rule', () => {
      const res = http.put(
        `${BASE_URL}/v1/rules/${createdRuleId}/approve`,
        null,
        authParams(adminTokens, { tags: { name: 'approve_rule' } })
      );
      if (res.status !== 200) {
        console.error(`[approve_rule] HTTP ${res.status}: ${res.body}`);
      }
      check(res, {
        'approve rule: status 200': (r) => r.status === 200,
        'approve rule: has id': (r) => r.json('id') !== undefined,
      });
    });
    randomSleep(1, 2);
  }

  group('07-list-pending-templates', () => {
    const res = http.get(
      `${BASE_URL}/v1/templates/pending?page=1&size=10`,
      authParams(adminTokens, { tags: { name: 'list_pending_templates' } })
    );
    check(res, {
      'list pending templates: status 200': (r) => r.status === 200,
      'list pending templates: has items': (r) => Array.isArray(r.json('items')),
    });
    if (!createdTemplateId) {
      const items = res.json('items') ?? [];
      createdTemplateId = items[0]?.id ?? null;
    }
  });
  randomSleep(1, 2);

  if (createdTemplateId) {
    group('08-approve-template', () => {
      const res = http.put(
        `${BASE_URL}/v1/templates/${createdTemplateId}/approve`,
        null,
        authParams(adminTokens, { tags: { name: 'approve_template' } })
      );
      if (res.status !== 200) {
        console.error(`[approve_template] HTTP ${res.status}: ${res.body}`);
      }
      check(res, {
        'approve template: status 200': (r) => r.status === 200,
        'approve template: has id': (r) => r.json('id') !== undefined,
      });
    });
    randomSleep(1, 2);
  }

  randomSleep(1, 3);
}
