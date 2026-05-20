/**
 * Helper functions cho test endpoint /api/v1/templates.
 *
 * Lưu ý:
 *  - Các hàm dùng trong setup() / teardown() chạy ở init context, vẫn dùng http từ k6
 *  - snapshotTemplate / restoreTemplate dùng FormTemplateUpdate (chỉ restore được name, description, tags)
 */

import http from 'k6/http';
import { BASE_URL, authParams } from './auth.js';

export const TEMPLATES_URL = `${BASE_URL}/v1/templates`;

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
 * Lấy danh sách ID template hiện có trên server (không filter theo tag).
 * Dùng trong setup() để có ID thật cho GET/UPDATE test.
 */
export function findSeedTemplateIds(tokens, limit = 30) {
  const res = http.get(`${TEMPLATES_URL}?size=100`, authParams(tokens));
  if (res.status !== 200) {
    throw new Error(`findSeedTemplateIds: HTTP ${res.status} — ${(res.body || '').slice(0, 200)}`);
  }
  const items = res.json('items') ?? res.json('data') ?? [];
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('findSeedTemplateIds: 0 template trên server — chạy ./scripts/seed.sh trước');
  }
  return items.slice(0, limit).map((t) => t.id);
}

/** GET template by id → trả về object đủ để restore lại (name, description, tags). */
export function snapshotTemplate(tokens, id) {
  const res = http.get(`${TEMPLATES_URL}/${id}`, authParams(tokens));
  if (res.status !== 200) {
    throw new Error(`snapshotTemplate(${id}): HTTP ${res.status}`);
  }
  const body = res.json();
  const data = body?.data ?? body ?? {};
  return {
    id,
    name: data.name,
    description: data.description ?? null,
    tags: Array.isArray(data.tags) ? data.tags : [],
  };
}

/** PUT lại snapshot. Trả về k6 Response. */
export function restoreTemplate(tokens, snap) {
  return http.put(
    `${TEMPLATES_URL}/${snap.id}`,
    JSON.stringify({ name: snap.name, description: snap.description, tags: snap.tags }),
    authParams(tokens)
  );
}

/** Tạo template, trả về id. Throw nếu fail. */
export function createTemplate(tokens, payload) {
  const res = http.post(TEMPLATES_URL, JSON.stringify(payload), authParams(tokens));
  if (res.status !== 200 && res.status !== 201) {
    throw new Error(`createTemplate: HTTP ${res.status} — ${(res.body || '').slice(0, 200)}`);
  }
  return pickId(res);
}

/** Xóa template — trả về k6 Response (không throw để teardown idempotent). */
export function deleteTemplate(tokens, id) {
  return http.del(`${TEMPLATES_URL}/${id}`, null, authParams(tokens));
}

/** Field mẫu tối thiểu để tạo template. */
export const SAMPLE_FIELDS = [
  { field_id: 'ho_ten',   field_name: 'Họ và tên', field_type: 'text',   required: true,  extraction_hints: 'Họ tên người ký' },
  { field_id: 'so_tien',  field_name: 'Số tiền',   field_type: 'number', required: false, extraction_hints: 'Số tiền VND'    },
  { field_id: 'ngay_lap', field_name: 'Ngày lập',  field_type: 'date',   required: false, extraction_hints: 'Ngày lập tài liệu' },
];
