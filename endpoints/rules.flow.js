/**
 * Endpoints — Rule Management
 *
 * Steps:
 *   01  POST /api/v1/auth/login                       — đăng nhập
 *   02  GET  /api/v1/rules?page=1&size=10             — danh sách quy tắc
 *   03  POST /api/v1/rules                            — tạo quy tắc mới
 *   04  GET  /api/v1/rules/{id}                       — xem chi tiết quy tắc
 *   05  PUT  /api/v1/rules/{id}                       — cập nhật quy tắc
 *   06  GET  /api/v1/rules?status=pending_approval      — danh sách quy tắc chờ duyệt
 *   07  GET  /api/v1/rules/tags                       — danh sách tags
 *   08  PATCH /api/v1/rules/{id}/tags                 — cập nhật tags của quy tắc
 *   09  DELETE /api/v1/rules/{id}                     — xoá quy tắc (tự dọn dẹp)
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

  group('02-list-rules', () => {
    const res = http.get(
      `${BASE_URL}/v1/rules?page=1&size=10`,
      authParams(tokens, { tags: { name: 'list_rules' } })
    );
    check(res, {
      'list rules: status 200': (r) => r.status === 200,
      'list rules: has items': (r) => Array.isArray(r.json('items')),
    });
  });
  randomSleep(1, 2);

  let ruleId;
  group('03-create-rule', () => {
    const payload = {
      name: `LT-Rule-${__VU}-${__ITER}-${Date.now()}`,
      description: 'Quy tắc tạo bởi load test',
      condition: 'field("invoice_date") != null',
      rule_type: 'prompt',
      severity: 'error',
      tags: ['load-test'],
    };
    const res = http.post(
      `${BASE_URL}/v1/rules`,
      JSON.stringify(payload),
      authParams(tokens, { tags: { name: 'create_rule' } })
    );
    if (res.status !== 200 && res.status !== 201) {
      console.error(`[create_rule] HTTP ${res.status}: ${res.body}`);
    }
    check(res, {
      'create rule: status 2xx': (r) => r.status === 200 || r.status === 201,
      'create rule: has id': (r) => r.json('id') !== undefined,
    });
    ruleId = res.json('id') ?? null;
  });
  randomSleep(1, 2);

  if (!ruleId) {
    randomSleep(1, 2);
    return;
  }

  group('04-get-rule', () => {
    const res = http.get(
      `${BASE_URL}/v1/rules/${ruleId}`,
      authParams(tokens, { tags: { name: 'get_rule' } })
    );
    check(res, {
      'get rule: status 200': (r) => r.status === 200,
      'get rule: has id': (r) => r.json('id') !== undefined,
    });
  });
  randomSleep(1, 2);

  group('05-update-rule', () => {
    const payload = {
      name: `LT-Rule-Updated-${__VU}-${__ITER}`,
      severity: 'warning',
    };
    const res = http.put(
      `${BASE_URL}/v1/rules/${ruleId}`,
      JSON.stringify(payload),
      authParams(tokens, { tags: { name: 'update_rule' } })
    );
    if (res.status !== 200) {
      console.error(`[update_rule] HTTP ${res.status}: ${res.body}`);
    }
    check(res, {
      'update rule: status 200': (r) => r.status === 200,
      'update rule: has id': (r) => r.json('id') !== undefined,
    });
  });
  randomSleep(1, 2);

  group('06-list-pending', () => {
    const res = http.get(
      `${BASE_URL}/v1/rules?status=pending_approval`,
      authParams(tokens, { tags: { name: 'list_pending_rules' } })
    );
    check(res, {
      'list pending rules: status 200': (r) => r.status === 200,
    });
  });
  randomSleep(1, 2);

  group('07-list-tags', () => {
    const res = http.get(
      `${BASE_URL}/v1/rules/tags`,
      authParams(tokens, { tags: { name: 'list_rule_tags' } })
    );
    check(res, {
      'list rule tags: status 200': (r) => r.status === 200,
    });
  });
  randomSleep(1, 2);

  group('08-patch-tags', () => {
    const payload = { tags: ['load-test', 'endpoint-test'] };
    const res = http.patch(
      `${BASE_URL}/v1/rules/${ruleId}/tags`,
      JSON.stringify(payload),
      authParams(tokens, { tags: { name: 'patch_rule_tags' } })
    );
    if (res.status !== 200) {
      console.error(`[patch_rule_tags] HTTP ${res.status}: ${res.body}`);
    }
    check(res, {
      'patch rule tags: status 200': (r) => r.status === 200,
    });
  });
  randomSleep(1, 2);

  group('09-delete-rule', () => {
    const res = http.del(
      `${BASE_URL}/v1/rules/${ruleId}`,
      null,
      authParams(tokens, { tags: { name: 'delete_rule' } })
    );
    check(res, {
      'delete rule: status 200': (r) => r.status === 200,
    });
  });
  randomSleep(1, 3);
}
