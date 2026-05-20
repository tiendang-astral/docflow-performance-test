/**
 * Helper functions cho async job pattern của DocFlow v3:
 *
 *   1. POST /v3/dossiers/{id}/extract/global  → JobResponse với status="queued"
 *   2. GET  /v3/jobs/{job_id}      (poll)     → JobResponse với status update theo thời gian
 *      status lifecycle: queued → running → completed | failed | cancelled
 *   3. Khi status=completed, body.result chứa summary + extraction_snapshots[].extracted_fields
 *
 * Cung cấp:
 *   - pollJob(): polling generic cho mọi v3 job
 *   - validateExtractResult(): kiểm tra schema result của extract job
 */

import http from 'k6/http';
import { sleep } from 'k6';
import { BASE_URL, authParams } from './auth.js';

export const BASE_URL_V3 = __ENV.BASE_URL_V3 || BASE_URL;

export const BASE_URL_V2 = __ENV.BASE_URL_V2 || BASE_URL;

export const JOBS_URL              = `${BASE_URL_V3}/v3/jobs`;
export const jobUrl                = (jobId) => `${JOBS_URL}/${jobId}`;
export const extractGlobalUrl      = (dossierId) => `${BASE_URL_V3}/v3/dossiers/${dossierId}/extract/global`;
export const validateEnqueueUrl    = (dossierId) => `${BASE_URL_V3}/v3/dossiers/${dossierId}/validate`;
export const runFullFlowUrl        = (dossierId) => `${BASE_URL_V3}/v3/dossiers/${dossierId}/run-full-flow`;

// v2 designer endpoint dùng cho thẩm định flow
export const rulesLinkUrl          = (dossierId) => `${BASE_URL_V2}/v2/dossiers/${dossierId}/rules/link`;

const TERMINAL_STATUSES = ['completed', 'failed', 'cancelled', 'expired'];

/**
 * Poll job status đến khi terminal (completed/failed/...) hoặc timeout.
 *
 * @param {Object} tokens         Auth tokens
 * @param {string} jobId          Job ID (UUID)
 * @param {Object} opts
 * @param {number} opts.timeoutMs   default 60000 — tổng thời gian poll tối đa
 * @param {number} opts.intervalMs  default 1000 — khoảng giữa các poll
 * @returns {{ job: object|null, terminal: boolean, elapsedMs: number, polls: number }}
 *   - job: response body cuối cùng (có thể null nếu poll fail)
 *   - terminal: true nếu đạt terminal status, false nếu timeout
 *   - elapsedMs: tổng thời gian poll
 *   - polls: số lần đã poll
 */
export function pollJob(tokens, jobId, opts = {}) {
  const timeoutMs  = opts.timeoutMs  ?? 60000;
  const intervalMs = opts.intervalMs ?? 1000;
  const tagName    = opts.tagName    ?? 'job_poll';

  const t0 = Date.now();
  let polls = 0;
  let lastJob = null;

  while (Date.now() - t0 < timeoutMs) {
    polls++;
    const res = http.get(jobUrl(jobId),
      authParams(tokens, { tags: { name: tagName } }));

    if (res.status !== 200) {
      return {
        job: null,
        terminal: false,
        elapsedMs: Date.now() - t0,
        polls,
        error: `poll HTTP ${res.status}: ${(res.body || '').slice(0, 200)}`,
      };
    }

    try {
      lastJob = res.json();
    } catch (_) {
      lastJob = null;
    }

    if (lastJob && TERMINAL_STATUSES.includes(lastJob.status)) {
      return { job: lastJob, terminal: true, elapsedMs: Date.now() - t0, polls };
    }

    sleep(intervalMs / 1000);
  }

  return { job: lastJob, terminal: false, elapsedMs: Date.now() - t0, polls };
}

/**
 * Validate schema của job.result khi extract job completed.
 *
 * Expected shape (trích từ trace thực):
 *   {
 *     success: true,
 *     message: string,
 *     summary: [{ template_id, template_name, form_id, status, fields_extracted, source_file, ... }],
 *     extraction_snapshots: [{
 *       template_id, form_id, status, source_file,
 *       extracted_fields: [{ id, field_id, field_type, extracted_value, confidence_score, ... }]
 *     }],
 *     templates_processed: number,
 *     templates_succeeded: number,
 *     duration_seconds: number,
 *   }
 */
export function validateExtractResult(result) {
  const errors = [];
  if (!result || typeof result !== 'object') {
    return { ok: false, errors: ['result không phải object'] };
  }

  if (result.success !== true) errors.push(`result.success ≠ true (got ${result.success})`);
  if (typeof result.message !== 'string') errors.push('result.message không phải string');
  if (typeof result.templates_processed !== 'number') errors.push('templates_processed không phải number');
  if (typeof result.templates_succeeded !== 'number') errors.push('templates_succeeded không phải number');

  if (!Array.isArray(result.summary)) {
    errors.push('summary không phải array');
  } else {
    result.summary.forEach((s, i) => {
      if (typeof s?.template_id !== 'number') errors.push(`summary[${i}].template_id`);
      if (typeof s?.status !== 'string')      errors.push(`summary[${i}].status`);
    });
  }

  if (!Array.isArray(result.extraction_snapshots)) {
    errors.push('extraction_snapshots không phải array');
  } else {
    result.extraction_snapshots.forEach((snap, i) => {
      if (typeof snap?.template_id !== 'number') errors.push(`snapshots[${i}].template_id`);
      if (!Array.isArray(snap?.extracted_fields)) {
        errors.push(`snapshots[${i}].extracted_fields không phải array`);
      } else {
        snap.extracted_fields.forEach((f, j) => {
          if (typeof f?.field_id !== 'string') errors.push(`snapshots[${i}].fields[${j}].field_id`);
          if (typeof f?.field_type !== 'string') errors.push(`snapshots[${i}].fields[${j}].field_type`);
          // confidence_score có thể null nếu field chưa extracted
          if (f?.confidence_score != null && typeof f.confidence_score !== 'number') {
            errors.push(`snapshots[${i}].fields[${j}].confidence_score không phải number|null`);
          }
        });
      }
    });
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Validate schema của job.result khi VALIDATE (thẩm định) job completed.
 *
 * Expected shape (trích từ trace thực):
 *   {
 *     dossier_id, dossier_status, validation_session_id, session_time,
 *     total_rules, executed, passed, failed, errors, advisory,
 *     results: [{
 *       rule_id, rule_name, rule_severity, rule_type, rule_content,
 *       status: "pass"|"fail"|"error"|"advisory",
 *       executed_at,
 *       result_details: {
 *         result: "PASS"|"FAIL"|...,
 *         summary, explanation,
 *         comparisons[], referenced_fields[], available_fields[], available_files[],
 *         trace[], violations[], evidence, recommendations[]
 *       }
 *     }],
 *     message, success, duration_seconds
 *   }
 */
export function validateValidateResult(result) {
  const errors = [];
  if (!result || typeof result !== 'object') {
    return { ok: false, errors: ['result không phải object'] };
  }

  const numFields = ['dossier_id', 'total_rules', 'executed', 'passed', 'failed', 'errors', 'advisory', 'duration_seconds'];
  for (const f of numFields) {
    if (typeof result[f] !== 'number')
      errors.push(`${f} không phải number (got ${typeof result[f]})`);
  }

  if (typeof result.validation_session_id !== 'string') errors.push('validation_session_id không phải string');
  if (typeof result.success !== 'boolean') errors.push('success không phải boolean');
  if (typeof result.message !== 'string')  errors.push('message không phải string');

  // Sanity: executed = passed + failed + errors + advisory
  if (typeof result.executed === 'number' &&
      typeof result.passed === 'number' &&
      typeof result.failed === 'number' &&
      typeof result.errors === 'number' &&
      typeof result.advisory === 'number' &&
      result.executed !== result.passed + result.failed + result.errors + result.advisory) {
    errors.push(`executed (${result.executed}) ≠ passed+failed+errors+advisory (${result.passed + result.failed + result.errors + result.advisory})`);
  }

  if (!Array.isArray(result.results)) {
    errors.push('results không phải array');
  } else {
    const validStatuses = ['pass', 'fail', 'error', 'advisory'];
    result.results.forEach((r, i) => {
      if (typeof r?.rule_id !== 'number') errors.push(`results[${i}].rule_id`);
      if (typeof r?.rule_name !== 'string') errors.push(`results[${i}].rule_name`);
      if (typeof r?.rule_severity !== 'string') errors.push(`results[${i}].rule_severity`);
      if (typeof r?.rule_type !== 'string') errors.push(`results[${i}].rule_type`);
      if (!validStatuses.includes(r?.status))
        errors.push(`results[${i}].status "${r?.status}" không trong ${JSON.stringify(validStatuses)}`);
      if (!r?.result_details || typeof r.result_details !== 'object')
        errors.push(`results[${i}].result_details không phải object`);
      else {
        if (typeof r.result_details.result !== 'string') errors.push(`results[${i}].result_details.result`);
        if (typeof r.result_details.summary !== 'string') errors.push(`results[${i}].result_details.summary`);
        if (!Array.isArray(r.result_details.comparisons)) errors.push(`results[${i}].result_details.comparisons không phải array`);
        if (!Array.isArray(r.result_details.referenced_fields)) errors.push(`results[${i}].result_details.referenced_fields không phải array`);
      }
    });
  }

  return { ok: errors.length === 0, errors };
}

const VALIDATE_PRECONDITION_REGEX = /no extracted data|no rule|chưa có dữ liệu|chưa có rule|empty|please extract data/i;

/** Check precondition-fail cho validate trong result (khi status=completed, success=false). */
export function isValidatePreconditionFail(result) {
  if (!result || typeof result !== 'object') return false;
  if (result.success !== false) return false;
  const msg = result.message ?? '';
  if (typeof msg !== 'string') return false;
  return VALIDATE_PRECONDITION_REGEX.test(msg);
}

/**
 * Check precondition-fail từ `error_message` (khi status=failed).
 * Trường hợp validate job fail với HTTP error message kiểu
 * "400: No extracted data available for validation. Please extract data first."
 */
export function isValidatePreconditionFailFromError(errorMessage) {
  if (typeof errorMessage !== 'string') return false;
  return VALIDATE_PRECONDITION_REGEX.test(errorMessage);
}

/** Tóm tắt validate result: "2/2 rules: 1 pass, 1 fail (5.55s)". */
export function summarizeValidateResult(result) {
  if (!result || typeof result !== 'object') return '(no result)';
  const total = result.total_rules ?? '?';
  const exec  = result.executed ?? '?';
  const dur   = result.duration_seconds != null ? `${result.duration_seconds.toFixed(2)}s` : '?';
  return `${exec}/${total} rules: ${result.passed}p/${result.failed}f/${result.errors}e/${result.advisory}a (${dur})`;
}

/**
 * Validate schema của job.result khi RUN-FULL-FLOW (chạy toàn luồng) completed.
 *
 * Result gồm 3 step (theo trace thực):
 *   step_1_wait_conversion: { status, files_count, ready_count, processing_count, error_count, elapsed_seconds }
 *   step_2_extraction     : { success, summary, extraction_snapshots, templates_processed, ... } — giống extract result
 *   step_3_validation     : { dossier_id, validation_session_id, results[], passed, failed, ... } — giống validate result
 */
export function validateFullFlowResult(result) {
  const errors = [];
  if (!result || typeof result !== 'object') {
    return { ok: false, errors: ['result không phải object'] };
  }

  // Top-level
  if (typeof result.success !== 'boolean') errors.push('success không phải boolean');
  if (typeof result.message !== 'string')  errors.push('message không phải string');
  if (typeof result.duration_seconds !== 'number') errors.push('duration_seconds không phải number');

  // Step 1: wait_conversion
  const s1 = result.step_1_wait_conversion;
  if (!s1 || typeof s1 !== 'object') {
    errors.push('step_1_wait_conversion không phải object');
  } else {
    if (typeof s1.status !== 'string') errors.push('step_1.status');
    for (const f of ['files_count', 'ready_count', 'processing_count', 'error_count', 'elapsed_seconds']) {
      if (typeof s1[f] !== 'number') errors.push(`step_1.${f}`);
    }
  }

  // Step 2: extraction — reuse validateExtractResult
  const s2 = result.step_2_extraction;
  if (!s2 || typeof s2 !== 'object') {
    errors.push('step_2_extraction không phải object');
  } else {
    const v = validateExtractResult(s2);
    if (!v.ok) v.errors.forEach((e) => errors.push(`step_2.${e}`));
  }

  // Step 3: validation — reuse validateValidateResult
  const s3 = result.step_3_validation;
  if (!s3 || typeof s3 !== 'object') {
    errors.push('step_3_validation không phải object');
  } else {
    const v = validateValidateResult(s3);
    if (!v.ok) v.errors.forEach((e) => errors.push(`step_3.${e}`));
  }

  return { ok: errors.length === 0, errors };
}

/** Check precondition-fail cho full-flow (vd 0 pool files, no markdown). */
export function isFullFlowPreconditionFail(result) {
  if (!result || typeof result !== 'object') return false;
  // Case 1: top-level success=false với message khớp
  if (result.success === false) {
    const msg = result.message ?? '';
    if (typeof msg === 'string' && /no (pool|markdown|extracted|file)|empty|not ready|chưa có/i.test(msg)) {
      return true;
    }
  }
  // Case 2: step_1 báo 0 files
  const s1 = result.step_1_wait_conversion;
  if (s1 && typeof s1 === 'object' && s1.files_count === 0) {
    return true;
  }
  // Case 3: step_2 fail kiểu extract precondition
  const s2 = result.step_2_extraction;
  if (s2 && isExtractPreconditionFail(s2)) return true;
  // Case 4: step_3 fail kiểu validate precondition
  const s3 = result.step_3_validation;
  if (s3 && isValidatePreconditionFail(s3)) return true;
  return false;
}

/** Tóm tắt 1 dòng: "step1=2/2 files, step2=2/2 tpl, step3=1p/1f (9.88s)". */
export function summarizeFullFlowResult(result) {
  if (!result || typeof result !== 'object') return '(no result)';
  const s1 = result.step_1_wait_conversion ?? {};
  const s2 = result.step_2_extraction ?? {};
  const s3 = result.step_3_validation ?? {};
  const dur = result.duration_seconds != null ? `${result.duration_seconds.toFixed(2)}s` : '?';
  return (
    `step1=${s1.ready_count ?? '?'}/${s1.files_count ?? '?'} files, ` +
    `step2=${s2.templates_succeeded ?? '?'}/${s2.templates_processed ?? '?'} tpl, ` +
    `step3=${s3.passed ?? '?'}p/${s3.failed ?? '?'}f/${s3.errors ?? '?'}e (${dur})`
  );
}

/**
 * Check xem `result` (khi job.status=completed) có phải precondition fail không.
 * Ví dụ "Không có markdown trong Pool" → endpoint hoạt động, chỉ thiếu data input.
 */
export function isExtractPreconditionFail(result) {
  if (!result || typeof result !== 'object') return false;
  if (result.success !== false) return false;
  const msg = result.message ?? '';
  if (typeof msg !== 'string') return false;
  return /không có (nội dung )?markdown|no markdown|no pool|chưa có file|no extracted|not ready|empty pool/i.test(msg);
}

/** Tóm tắt 1 dòng cho log: extract job completed → ... */
export function summarizeExtractResult(result) {
  if (!result || typeof result !== 'object') return '(no result)';
  const procd = result.templates_processed ?? '?';
  const succd = result.templates_succeeded ?? '?';
  const dur   = result.duration_seconds != null ? `${result.duration_seconds.toFixed(2)}s` : '?';
  const totalFields = (result.extraction_snapshots ?? [])
    .reduce((sum, s) => sum + (s.extracted_fields?.length || 0), 0);
  return `${succd}/${procd} templates, ${totalFields} fields, ${dur}`;
}
