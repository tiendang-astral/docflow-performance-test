/**
 * Helper functions cho test các endpoint Assessment & Processing:
 *   GET  /v1/assessment/dossiers              List user's dossiers for assessment
 *   GET  /v1/assessment/{id}/status           Processing status (PDF/extraction/validation)
 *   POST /v1/assessment/{id}/validate         Run rules validation (kết quả validate cho cả dossier)
 *
 * Tất cả các endpoint là read-only (status) hoặc trigger validation (validate) — KHÔNG
 * tạo/xóa entity → không cần teardown restore seed.
 */

import { BASE_URL } from './auth.js';

export const ASSESSMENT_URL          = `${BASE_URL}/v1/assessment`;
export const ASSESSMENT_DOSSIERS_URL = `${ASSESSMENT_URL}/dossiers`;

export const statusUrl   = (dossierId) => `${ASSESSMENT_URL}/${dossierId}/status`;
export const validateUrl = (dossierId) => `${ASSESSMENT_URL}/${dossierId}/validate`;

/** Tìm admin user (creator của seed dossiers → /assessment/dossiers sẽ trả về data). */
export function getAdminUser(users) {
  return users.find((u) => u.role === 'admin') || users[0];
}
