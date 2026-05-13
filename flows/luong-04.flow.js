/**
 * Luồng 04 — Duyệt biểu mẫu và quy tắc
 *
 * Steps:
 *   01  POST /api/v1/auth/login (user)              — đăng nhập user thường
 *   02  POST /api/v1/rules                           — tạo quy tắc để duyệt (→ pending)
 *   03  POST /api/v1/rules                           — tạo quy tắc để từ chối (→ pending)
 *   04  POST /api/v1/form-templates                  — tạo biểu mẫu để duyệt (→ pending)
 *   05  POST /api/v1/form-templates                  — tạo biểu mẫu để từ chối (→ pending)
 *   06  POST /api/v1/auth/login (admin)              — đăng nhập admin
 *   07  GET  /api/v1/rules/pending?source=own|public   — lấy danh sách quy tắc chờ duyệt
 *   08  PUT  /api/v1/rules/{id}/approve              — duyệt quy tắc
 *   09  PUT  /api/v1/rules/{id}/reject               — từ chối quy tắc
 *   10  GET  /api/v1/templates/pending?source=own|public — lấy danh sách biểu mẫu chờ duyệt
 *   11  PUT  /api/v1/templates/{id}/approve          — duyệt biểu mẫu
 *   12  PUT  /api/v1/templates/{id}/reject           — từ chối biểu mẫu
 */

import http from 'k6/http';
import { check, group } from 'k6';
import { BASE_URL, login, authParams } from '../lib/auth.js';
import { randomSleep } from '../lib/utils.js';

export default function runFlow(users) {
  const regularUsers = users.filter((u) => u.role === 'user');
  const adminUsers   = users.filter((u) => u.role === 'admin');

  if (adminUsers.length === 0) {
    console.error('luong-04: không có user với role=admin — bỏ qua iteration');
    randomSleep(1, 2);
    return;
  }

  const regularUser = regularUsers.length > 0 ? regularUsers[(__VU - 1) % regularUsers.length] : users[0];
  const adminUser   = adminUsers[(__VU - 1) % adminUsers.length];

  // ── Phần 1: User thường tạo 2 rule + 2 template (→ pending) ────────────────

  let userTokens;
  group('01-login-user', () => {
    userTokens = login(regularUser);
  });

  if (!userTokens?.accessToken) {
    randomSleep(1, 2);
    return;
  }

  let ruleToApproveId;
  group('02-create-rule-to-approve', () => {
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
      console.error(`[create_rule_approve] HTTP ${res.status}: ${res.body}`);
    }
    check(res, {
      'create rule to approve: status 2xx': (r) => r.status === 200 || r.status === 201,
      'create rule to approve: has id': (r) => r.json('id') !== undefined,
    });
    ruleToApproveId = res.json('id') ?? null;
  });
  randomSleep(1, 2);

  let ruleToRejectId;
  group('03-create-rule-to-reject', () => {
    const payload = {
      name: `LT-Reject-Rule-VU${__VU}-I${__ITER}-${Date.now()}`,
      description: 'Quy tắc tạo để test từ chối',
      condition: `field("amount") > 0`,
      rule_type: 'expression',
      severity: 'warning',
    };
    const res = http.post(
      `${BASE_URL}/v1/rules`,
      JSON.stringify(payload),
      authParams(userTokens, { tags: { name: 'create_rule' } })
    );
    if (res.status !== 200 && res.status !== 201) {
      console.error(`[create_rule_reject] HTTP ${res.status}: ${res.body}`);
    }
    check(res, {
      'create rule to reject: status 2xx': (r) => r.status === 200 || r.status === 201,
      'create rule to reject: has id': (r) => r.json('id') !== undefined,
    });
    ruleToRejectId = res.json('id') ?? null;
  });
  randomSleep(1, 2);

  let formToApproveId;
  group('04-create-form-to-approve', () => {
    const payload = {
      name: `LT-Approve-Form-VU${__VU}-I${__ITER}-${Date.now()}`,
      description: 'Biểu mẫu tạo để test duyệt',
      fields: [],
    };
    const res = http.post(
      `${BASE_URL}/v1/form-templates`,
      JSON.stringify(payload),
      authParams(userTokens, { tags: { name: 'create_form' } })
    );
    if (res.status !== 200 && res.status !== 201) {
      console.error(`[create_form_approve] HTTP ${res.status}: ${res.body}`);
    }
    check(res, {
      'create form to approve: status 2xx': (r) => r.status === 200 || r.status === 201,
      'create form to approve: success': (r) => r.json('success') === true,
    });
    formToApproveId = (res.json() ?? {})?.data?.id ?? null;
  });
  randomSleep(1, 2);

  let formToRejectId;
  group('05-create-form-to-reject', () => {
    const payload = {
      name: `LT-Reject-Form-VU${__VU}-I${__ITER}-${Date.now()}`,
      description: 'Biểu mẫu tạo để test từ chối',
      fields: [],
    };
    const res = http.post(
      `${BASE_URL}/v1/form-templates`,
      JSON.stringify(payload),
      authParams(userTokens, { tags: { name: 'create_form' } })
    );
    if (res.status !== 200 && res.status !== 201) {
      console.error(`[create_form_reject] HTTP ${res.status}: ${res.body}`);
    }
    check(res, {
      'create form to reject: status 2xx': (r) => r.status === 200 || r.status === 201,
      'create form to reject: success': (r) => r.json('success') === true,
    });
    formToRejectId = (res.json() ?? {})?.data?.id ?? null;
  });
  randomSleep(1, 2);

  // ── Phần 2: Admin duyệt và từ chối rule + form ─────────────────────────────

  let adminTokens;
  group('06-login-admin', () => {
    adminTokens = login(adminUser);
  });

  if (!adminTokens?.accessToken) {
    randomSleep(1, 2);
    return;
  }

  group('07-list-pending-rules', () => {
    const res = http.get(
      `${BASE_URL}/v1/rules/pending?source=own&page=1&size=10`,
      authParams(adminTokens, { tags: { name: 'list_pending_rules' } })
    );
    check(res, {
      'list pending rules: status 200': (r) => r.status === 200,
      'list pending rules: has items': (r) => Array.isArray(r.json('items')),
    });
    const items = res.json('items') ?? [];
    if (!ruleToApproveId) ruleToApproveId = items[0]?.id ?? null;
    if (!ruleToRejectId)  ruleToRejectId  = items[1]?.id ?? null;
  });
  randomSleep(1, 2);

  if (ruleToApproveId) {
    group('08-approve-rule', () => {
      const res = http.put(
        `${BASE_URL}/v1/rules/${ruleToApproveId}/approve`,
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

  if (ruleToRejectId) {
    group('09-reject-rule', () => {
      const res = http.put(
        `${BASE_URL}/v1/rules/${ruleToRejectId}/reject`,
        JSON.stringify({ action: 'reject', rejection_reason: 'Load test — từ chối tự động' }),
        authParams(adminTokens, { tags: { name: 'reject_rule' } })
      );
      if (res.status !== 200) {
        console.error(`[reject_rule] HTTP ${res.status}: ${res.body}`);
      }
      check(res, {
        'reject rule: status 200': (r) => r.status === 200,
        'reject rule: has id': (r) => r.json('id') !== undefined,
      });
    });
    randomSleep(1, 2);
  }

  group('10-list-pending-forms', () => {
    const res = http.get(
      `${BASE_URL}/v1/templates/pending?source=own&page=1&size=10`,
      authParams(adminTokens, { tags: { name: 'list_pending_forms' } })
    );
    check(res, {
      'list pending forms: status 200': (r) => r.status === 200,
      'list pending forms: has items': (r) => Array.isArray(r.json('items')),
    });
    const items = res.json('items') ?? [];
    if (!formToApproveId) formToApproveId = items[0]?.id ?? null;
    if (!formToRejectId)  formToRejectId  = items[1]?.id ?? null;
  });
  randomSleep(1, 2);

  if (formToApproveId) {
    group('11-approve-form', () => {
      const res = http.put(
        `${BASE_URL}/v1/templates/${formToApproveId}/approve`,
        null,
        authParams(adminTokens, { tags: { name: 'approve_form' } })
      );
      if (res.status !== 200) {
        console.error(`[approve_form] HTTP ${res.status}: ${res.body}`);
      }
      check(res, {
        'approve form: status 200': (r) => r.status === 200,
        'approve form: has id': (r) => r.json('id') !== undefined,
      });
    });
    randomSleep(1, 2);
  }

  if (formToRejectId) {
    group('12-reject-form', () => {
      const res = http.put(
        `${BASE_URL}/v1/templates/${formToRejectId}/reject`,
        JSON.stringify({ rejection_reason: 'Load test — từ chối tự động' }),
        authParams(adminTokens, { tags: { name: 'reject_form' } })
      );
      if (res.status !== 200) {
        console.error(`[reject_form] HTTP ${res.status}: ${res.body}`);
      }
      check(res, {
        'reject form: status 200': (r) => r.status === 200,
        'reject form: has id': (r) => r.json('id') !== undefined,
      });
    });
    randomSleep(1, 2);
  }

  randomSleep(1, 3);
}
