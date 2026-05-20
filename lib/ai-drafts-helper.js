/**
 * Helper functions cho test endpoint AI Draft Generation:
 *   POST /v1/ai/generate-template-draft  → AITemplateDraft
 *   POST /v1/ai/generate-rule-draft      → AIRuleDraft
 *
 * Cả 2 endpoint chỉ generate draft (KHÔNG persist) → không cần cleanup.
 *
 * Response validation theo schema trong docs/api.json:
 *   AITemplateDraft: name(1-255), description?, tags[], fields[≥1]
 *     field: field_id(1-500), field_name(1-255), field_type(enum), required(bool)
 *   AIRuleDraft:     name(1-255), description?, tags[], rule_type="prompt",
 *                    severity(enum), condition(≥1)
 */

import { BASE_URL } from './auth.js';

export const TEMPLATE_DRAFT_URL = `${BASE_URL}/v1/ai/generate-template-draft`;
export const RULE_DRAFT_URL     = `${BASE_URL}/v1/ai/generate-rule-draft`;

/** Tìm admin user từ users.json. */
export function getAdminUser(users) {
  return users.find((u) => u.role === 'admin') || users[0];
}

const FIELD_TYPES = ['text', 'number', 'date', 'boolean', 'list', 'table'];
const SEVERITIES  = ['error', 'warning', 'info', 'advisory'];

/**
 * Validate response body của /generate-template-draft theo schema AITemplateDraft.
 * Trả về { ok: boolean, errors: string[] } để debug.
 */
export function validateTemplateDraft(body) {
  const errors = [];
  if (!body || typeof body !== 'object') {
    return { ok: false, errors: ['body không phải object'] };
  }

  // name (required, 1-255)
  if (typeof body.name !== 'string') errors.push('name không phải string');
  else if (body.name.length < 1 || body.name.length > 255)
    errors.push(`name length ${body.name.length} ngoài [1,255]`);

  // description (optional, string|null)
  if (body.description != null && typeof body.description !== 'string')
    errors.push('description không phải string|null');

  // tags (string[])
  if (!Array.isArray(body.tags))
    errors.push('tags không phải array');
  else if (!body.tags.every((t) => typeof t === 'string'))
    errors.push('tags chứa item không phải string');

  // fields (required, ≥1)
  if (!Array.isArray(body.fields)) {
    errors.push('fields không phải array');
  } else if (body.fields.length < 1) {
    errors.push('fields rỗng (cần ≥1)');
  } else {
    body.fields.forEach((f, i) => {
      const prefix = `fields[${i}]`;
      if (!f || typeof f !== 'object') { errors.push(`${prefix}: không phải object`); return; }

      if (typeof f.field_id !== 'string') errors.push(`${prefix}.field_id không phải string`);
      else if (f.field_id.length < 1 || f.field_id.length > 500)
        errors.push(`${prefix}.field_id length ${f.field_id.length} ngoài [1,500]`);

      if (typeof f.field_name !== 'string') errors.push(`${prefix}.field_name không phải string`);
      else if (f.field_name.length < 1 || f.field_name.length > 255)
        errors.push(`${prefix}.field_name length ${f.field_name.length} ngoài [1,255]`);

      if (!FIELD_TYPES.includes(f.field_type))
        errors.push(`${prefix}.field_type "${f.field_type}" không trong ${JSON.stringify(FIELD_TYPES)}`);

      if (typeof f.required !== 'boolean')
        errors.push(`${prefix}.required không phải boolean`);

      if (f.description != null && typeof f.description !== 'string')
        errors.push(`${prefix}.description không phải string|null`);

      if (f.extraction_hints != null && typeof f.extraction_hints !== 'string')
        errors.push(`${prefix}.extraction_hints không phải string|null`);
    });
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Validate response body của /generate-rule-draft theo schema AIRuleDraft.
 */
export function validateRuleDraft(body) {
  const errors = [];
  if (!body || typeof body !== 'object') {
    return { ok: false, errors: ['body không phải object'] };
  }

  if (typeof body.name !== 'string') errors.push('name không phải string');
  else if (body.name.length < 1 || body.name.length > 255)
    errors.push(`name length ${body.name.length} ngoài [1,255]`);

  if (body.description != null && typeof body.description !== 'string')
    errors.push('description không phải string|null');

  if (!Array.isArray(body.tags))
    errors.push('tags không phải array');
  else if (!body.tags.every((t) => typeof t === 'string'))
    errors.push('tags chứa item không phải string');

  if (body.rule_type !== 'prompt')
    errors.push(`rule_type "${body.rule_type}" ≠ "prompt"`);

  if (!SEVERITIES.includes(body.severity))
    errors.push(`severity "${body.severity}" không trong ${JSON.stringify(SEVERITIES)}`);

  if (typeof body.condition !== 'string')
    errors.push('condition không phải string');
  else if (body.condition.length < 1)
    errors.push('condition rỗng');

  return { ok: errors.length === 0, errors };
}

/** Prompt mẫu để generate template draft (tiếng Việt, đa dạng domain). */
export const TEMPLATE_PROMPTS = [
  'Biểu mẫu hóa đơn giá trị gia tăng với các trường: mã số thuế người bán, mã số thuế người mua, số tiền, ngày lập, thuế suất',
  'Biểu mẫu hồ sơ nhân sự gồm họ tên, ngày sinh, địa chỉ thường trú, mã nhân viên, ảnh chân dung, ngày vào làm',
  'Biểu mẫu hợp đồng kinh tế: tên bên A, tên bên B, giá trị hợp đồng, ngày hiệu lực, ngày hết hạn, điều khoản thanh toán',
  'Biểu mẫu đơn xin nghỉ phép có họ tên, mã nhân viên, ngày bắt đầu nghỉ, ngày kết thúc, lý do nghỉ',
  'Biểu mẫu báo giá sản phẩm gồm tên sản phẩm, mã sản phẩm, số lượng, đơn giá, tổng tiền, ngày hiệu lực báo giá',
  'Biểu mẫu quyết định bổ nhiệm với họ tên người được bổ nhiệm, chức vụ mới, ngày hiệu lực, người ký quyết định',
  'Biểu mẫu phiếu thu tiền mặt có số phiếu, ngày lập, họ tên người nộp, số tiền, lý do thu, chữ ký thủ quỹ',
];

/** Prompt mẫu để generate rule draft (luôn là prompt-type rule). */
export const RULE_PROMPTS = [
  'Kiểm tra hợp đồng có chữ ký của cả bên A và bên B',
  'Kiểm tra hóa đơn có đầy đủ mã số thuế của người bán và người mua',
  'Kiểm tra ngày hiệu lực không được sau ngày hết hạn',
  'Kiểm tra hồ sơ nhân sự có ảnh chân dung 3x4 và bản scan CMND/CCCD',
  'Kiểm tra văn bản có dấu đỏ của công ty ở cuối trang',
  'Kiểm tra phiếu thu có chữ ký của thủ quỹ và người nộp tiền',
  'Kiểm tra quyết định bổ nhiệm có chữ ký của giám đốc và đóng dấu',
];
