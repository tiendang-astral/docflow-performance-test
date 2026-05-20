/**
 * Helper functions cho test endpoint /api/v1/rules.
 *
 * Lưu ý:
 *  - RuleUpdate cho phép restore đầy đủ: name, description, tags, condition, rule_type, severity
 *  - rule_type chỉ có 2 giá trị: "prompt" | "expression"
 *  - severity: "error" | "warning" | "info" | "advisory"
 */

import http from 'k6/http';
import { BASE_URL, authParams } from './auth.js';

export const RULES_URL = `${BASE_URL}/v1/rules`;

/** Tìm admin user từ users.json. Fallback về user đầu nếu không có admin. */
export function getAdminUser(users) {
  return users.find((u) => u.role === 'admin') || users[0];
}

/** Đào id từ response: hỗ trợ {id}, {data:{id}}. */
export function pickId(res) {
  const body = res.json();
  if (!body || typeof body !== 'object') return null;
  return body.id ?? body.data?.id ?? null;
}

/**
 * Lấy danh sách ID rule hiện có trên server (không filter theo tag).
 * Dùng trong setup() để có ID thật cho GET/UPDATE test.
 */
export function findSeedRuleIds(tokens, limit = 30) {
  const res = http.get(`${RULES_URL}?size=100`, authParams(tokens));
  if (res.status !== 200) {
    throw new Error(`findSeedRuleIds: HTTP ${res.status} — ${(res.body || '').slice(0, 200)}`);
  }
  const items = res.json('items') ?? res.json('data') ?? [];
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('findSeedRuleIds: 0 rule trên server — chạy ./scripts/seed.sh trước');
  }
  return items.slice(0, limit).map((r) => r.id);
}

/** GET rule by id → trả về object đủ để restore lại đầy đủ. */
export function snapshotRule(tokens, id) {
  const res = http.get(`${RULES_URL}/${id}`, authParams(tokens));
  if (res.status !== 200) {
    throw new Error(`snapshotRule(${id}): HTTP ${res.status}`);
  }
  const body = res.json();
  const data = body?.data ?? body ?? {};
  return {
    id,
    name: data.name,
    description: data.description ?? null,
    tags: Array.isArray(data.tags) ? data.tags : [],
    condition: data.condition,
    rule_type: data.rule_type ?? 'prompt',
    severity: data.severity ?? 'error',
  };
}

/** PUT lại snapshot. Trả về k6 Response. */
export function restoreRule(tokens, snap) {
  return http.put(
    `${RULES_URL}/${snap.id}`,
    JSON.stringify({
      name: snap.name,
      description: snap.description,
      tags: snap.tags,
      condition: snap.condition,
      rule_type: snap.rule_type,
      severity: snap.severity,
    }),
    authParams(tokens)
  );
}

/** Tạo rule, trả về id. Throw nếu fail. */
export function createRule(tokens, payload) {
  const res = http.post(RULES_URL, JSON.stringify(payload), authParams(tokens));
  if (res.status !== 200 && res.status !== 201) {
    throw new Error(`createRule: HTTP ${res.status} — ${(res.body || '').slice(0, 200)}`);
  }
  return pickId(res);
}

/** Xóa rule — trả về k6 Response (không throw để teardown idempotent). */
export function deleteRule(tokens, id) {
  return http.del(`${RULES_URL}/${id}`, null, authParams(tokens));
}

/** Payload mẫu tối thiểu để tạo rule. */
export const SAMPLE_RULE = {
  description: 'Test rule — auto cleanup',
  condition: 'so_tien > 0',
  rule_type: 'expression',
  severity: 'warning',
};
