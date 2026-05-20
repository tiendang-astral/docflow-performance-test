/**
 * Helper functions cho test upload file vào Pool của Dossier.
 *
 * Endpoints (v2 — có thể trên port khác, dùng BASE_URL_V2):
 *   POST   /v2/dossiers/{id}/pool/upload       Upload 1 file
 *   GET    /v2/dossiers/{id}/pool              List files trong pool
 *   DELETE /v2/dossiers/{id}/pool              Xóa toàn bộ pool
 *   DELETE /v2/dossiers/{id}/pool/{file_id}    Xóa 1 file
 *
 * Strategy: setup() tạo dossier riêng cho test (không đụng seed), teardown()
 * xóa cả dossier → pool tự động dọn theo.
 */

import http from 'k6/http';
import { BASE_URL, authParams } from './auth.js';

export const BASE_URL_V2 = __ENV.BASE_URL_V2 || BASE_URL;
export const DOSSIERS_URL    = `${BASE_URL}/v1/dossiers`;
export const DOSSIERS_V2_URL = `${BASE_URL_V2}/v2/dossiers`;

/** Tìm admin user từ users.json. */
export function getAdminUser(users) {
  return users.find((u) => u.role === 'admin') || users[0];
}

/** Đào id từ response. */
export function pickId(res) {
  const body = res.json();
  if (!body || typeof body !== 'object') return null;
  return body.id ?? body.data?.id ?? null;
}

/**
 * Tham số multipart — giống authParams nhưng KHÔNG set Content-Type
 * (k6 tự set multipart/form-data với boundary).
 */
export function multipartParams(tokens, extra = {}) {
  const params = authParams(tokens, extra);
  if (params.headers && params.headers['Content-Type']) {
    delete params.headers['Content-Type'];
  }
  return params;
}

/** URLs */
export const poolUploadUrl = (dossierId) => `${DOSSIERS_V2_URL}/${dossierId}/pool/upload`;
export const poolUrl       = (dossierId) => `${DOSSIERS_V2_URL}/${dossierId}/pool`;
export const poolFileUrl   = (dossierId, fileId) => `${DOSSIERS_V2_URL}/${dossierId}/pool/${fileId}`;

/** Tạo dossier dành riêng cho upload test. Throw nếu fail. */
export function createTestDossier(tokens, name) {
  const res = http.post(DOSSIERS_URL,
    JSON.stringify({
      name,
      description: 'Dossier dành riêng cho upload test — sẽ xóa ở teardown',
      tags: ['_upload_test'],
      status: 'draft',
      visibility: 'private',
      template_ids: [],
      rule_ids: [],
    }),
    authParams(tokens)
  );
  if (res.status !== 200 && res.status !== 201) {
    throw new Error(`createTestDossier: HTTP ${res.status} — ${(res.body || '').slice(0, 200)}`);
  }
  const id = pickId(res);
  if (id == null) throw new Error(`createTestDossier: response không có id`);
  return id;
}

/** Xóa toàn bộ dossier (cascade xóa pool files). */
export function deleteTestDossier(tokens, dossierId) {
  return http.del(`${DOSSIERS_URL}/${dossierId}`, null, authParams(tokens));
}

/** Xóa toàn bộ pool files của 1 dossier. */
export function deleteAllPoolFiles(tokens, dossierId) {
  return http.del(poolUrl(dossierId), null, authParams(tokens));
}

/** Upload 1 file vào pool. fileData phải là ArrayBuffer (mở bằng open(path, 'b')). */
export function uploadToPool(tokens, dossierId, fileData, filename, mimeType = 'application/pdf', extra = {}) {
  const formData = {
    file: http.file(fileData, filename, mimeType),
  };
  return http.post(
    poolUploadUrl(dossierId),
    formData,
    multipartParams(tokens, { timeout: '120s', ...extra })
  );
}
