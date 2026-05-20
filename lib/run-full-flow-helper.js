/**
 * Helper functions cho test endpoint "Run Full Flow":
 *
 *   POST /v2/dossiers/{id}/run-full-flow   Synchronous — block đến khi flow xong
 *                                          Steps: wait pool files → extract → validate
 *                                          Có thể mất nhiều phút nếu data lớn.
 *
 *   POST /v3/dossiers/{id}/run-full-flow   Async enqueue — trả ngay JobResponse
 *                                          Body: { use_agent_mode, wait_timeout_seconds, poll_interval_seconds }
 *                                          Job chạy background queue.
 *
 * Smoke chấp nhận precondition fail (vd seed dossier chưa có pool files) là healthy
 * miễn server trả response đúng cấu trúc.
 */

import { BASE_URL } from './auth.js';

export const BASE_URL_V2 = __ENV.BASE_URL_V2 || BASE_URL;
export const BASE_URL_V3 = __ENV.BASE_URL_V3 || BASE_URL;

export const runFullFlowSyncUrl  = (dossierId) => `${BASE_URL_V2}/v2/dossiers/${dossierId}/run-full-flow`;
export const runFullFlowAsyncUrl = (dossierId) => `${BASE_URL_V3}/v3/dossiers/${dossierId}/run-full-flow`;

/** Tìm admin user. */
export function getAdminUser(users) {
  return users.find((u) => u.role === 'admin') || users[0];
}

/**
 * Validate JobResponse (v3 async).
 * Required fields: id, job_type, job_key, target_type, target_id, queue_name, priority, status, payload.
 */
export function validateJobResponse(body) {
  const errors = [];
  if (!body || typeof body !== 'object') {
    return { ok: false, errors: ['body không phải object'] };
  }

  const requiredStrings = ['id', 'job_type', 'job_key', 'target_type', 'target_id', 'queue_name', 'status'];
  for (const f of requiredStrings) {
    if (typeof body[f] !== 'string')
      errors.push(`${f} không phải string (got ${typeof body[f]})`);
  }
  if (typeof body.priority !== 'number')
    errors.push(`priority không phải number`);
  if (body.payload != null && typeof body.payload !== 'object')
    errors.push(`payload không phải object|null`);

  return { ok: errors.length === 0, errors };
}

/** Check response có phải "precondition failed" hợp lệ không (4xx + có detail). */
export function isPreconditionFail(res, body) {
  if (res.status < 400 || res.status >= 500) return false;
  if (!body || typeof body !== 'object') return false;
  const detail = body.detail ?? body.message ?? '';
  if (typeof detail !== 'string') return false;
  // các message hợp lý: "no extracted data", "no pool files", "files not ready", etc.
  return /no extracted|no pool|not ready|chưa sẵn sàng|chưa có file/i.test(detail);
}
