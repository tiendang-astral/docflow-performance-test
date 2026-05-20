/**
 * Helper functions cho test endpoint /api/v1/dossiers.
 *
 * Lưu ý:
 *  - DossierUpdate cho phép restore: name, description, tags, status
 *  - DossierStatus: "draft" | "processing" | "ready" | "completed"
 *  - DossierVisibility: "private" | "public"
 *  - Endpoint list KHÔNG có `source` filter (như templates/rules) — chỉ có
 *    status, visibility, tags, department_id, search.
 */

import http from 'k6/http';
import { BASE_URL, authParams } from './auth.js';

export const DOSSIERS_URL = `${BASE_URL}/v1/dossiers`;

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
 * Lấy danh sách ID dossier hiện có trên server (không filter).
 * Dùng trong setup() để có ID thật cho GET/UPDATE test.
 */
export function findSeedDossierIds(tokens, limit = 30) {
  const res = http.get(`${DOSSIERS_URL}?size=100`, authParams(tokens));
  if (res.status !== 200) {
    throw new Error(`findSeedDossierIds: HTTP ${res.status} — ${(res.body || '').slice(0, 200)}`);
  }
  const items = res.json('items') ?? res.json('data') ?? [];
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('findSeedDossierIds: 0 dossier trên server — chạy ./scripts/seed.sh trước');
  }
  return items.slice(0, limit).map((d) => d.id);
}

/** GET dossier by id → trả về object đủ để restore (name/description/tags/status). */
export function snapshotDossier(tokens, id) {
  const res = http.get(`${DOSSIERS_URL}/${id}`, authParams(tokens));
  if (res.status !== 200) {
    throw new Error(`snapshotDossier(${id}): HTTP ${res.status}`);
  }
  const body = res.json();
  const data = body?.data ?? body ?? {};
  return {
    id,
    name: data.name,
    description: data.description ?? null,
    tags: Array.isArray(data.tags) ? data.tags : [],
    status: data.status ?? 'draft',
  };
}

/** PUT lại snapshot. */
export function restoreDossier(tokens, snap) {
  return http.put(
    `${DOSSIERS_URL}/${snap.id}`,
    JSON.stringify({
      name: snap.name,
      description: snap.description,
      tags: snap.tags,
      status: snap.status,
    }),
    authParams(tokens)
  );
}

/** Tạo dossier, trả về id. Throw nếu fail. */
export function createDossier(tokens, payload) {
  const res = http.post(DOSSIERS_URL, JSON.stringify(payload), authParams(tokens));
  if (res.status !== 200 && res.status !== 201) {
    throw new Error(`createDossier: HTTP ${res.status} — ${(res.body || '').slice(0, 200)}`);
  }
  return pickId(res);
}

/** Xóa dossier — trả về k6 Response (idempotent cho teardown). */
export function deleteDossier(tokens, id) {
  return http.del(`${DOSSIERS_URL}/${id}`, null, authParams(tokens));
}

/** Payload mẫu tối thiểu để tạo dossier. */
export const SAMPLE_DOSSIER = {
  description: 'Test dossier — auto cleanup',
  tags: [],
  status: 'draft',
  visibility: 'private',
  template_ids: [],
  rule_ids: [],
};
