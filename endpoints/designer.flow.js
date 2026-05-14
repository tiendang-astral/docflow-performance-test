/**
 * Endpoint Group: designer — Designer (Pool, Graph, Extract, Validate)
 *
 * Steps:
 *   01  POST /api/v1/auth/login                                    — đăng nhập
 *   02  POST /api/v1/dossiers                                       — tạo hồ sơ (setup)
 *   03  GET  /api/v2/dossiers/{id}/graph                            — lấy graph
 *   04  PUT  /api/v2/dossiers/{id}/graph                            — cập nhật graph
 *   05  GET  /api/v2/dossiers/{id}/routing-guidance                 — lấy hướng dẫn định tuyến
 *   06  PUT  /api/v2/dossiers/{id}/routing-guidance                 — cập nhật hướng dẫn định tuyến
 *   07  GET  /api/v2/dossiers/{id}/validation-history               — xem lịch sử xác thực
 *   08  POST /api/v2/dossiers/{id}/pool/upload                      — upload file vào kho
 *   09  GET  /api/v2/dossiers/{id}/pool                             — xem danh sách file
 *   10  GET  /api/v2/dossiers/{id}/pool/{fileId}/preview            — xem trước file
 *   11  GET  /api/v2/dossiers/{id}/pool/{fileId}/content            — xem nội dung file
 *   12  POST /api/v2/dossiers/{id}/pool/{fileId}/reconvert          — chuyển đổi lại file
 *   13  POST /api/v2/dossiers/{id}/pool/{fileId}/resummarize        — tóm tắt lại file
 *   14  PATCH /api/v2/dossiers/{id}/pool/{fileId}/summary           — cập nhật tóm tắt file
 *   15  DELETE /api/v2/dossiers/{id}/pool/{fileId}                  — xoá file
 *   16  DELETE /api/v1/dossiers/{id}                                — xoá hồ sơ (cleanup)
 *
 * Yêu cầu: data/fixtures/sample.pdf phải tồn tại cho bước upload.
 */

import http from 'k6/http';
import { check, group } from 'k6';
import { BASE_URL, login, authParams } from '../lib/auth.js';
import { randomSleep } from '../lib/utils.js';

// Treat 200 and 400 as "expected" for async-trigger endpoints (resummarize).
// This prevents k6 from counting 400 as http_req_failed for those calls.
const asyncExpected = http.expectedStatuses(200, 400);

// Load sample PDF at init time — open() runs once per VU initialisation
let sampleFileContent;
try {
  sampleFileContent = open('../data/fixtures/sample.pdf', 'b');
} catch (_) {
  sampleFileContent = null;
}

/** Build multipart-safe params (no Content-Type so k6 sets multipart boundary). */
function uploadParams(tokens, extra = {}) {
  const parts = [];
  if (tokens.accessToken)  parts.push(`docai_access_token=${tokens.accessToken}`);
  if (tokens.refreshToken) parts.push(`docai_refresh_token=${tokens.refreshToken}`);
  if (tokens.csrfToken)    parts.push(`docai_csrf_token=${tokens.csrfToken}`);
  const headers = { Cookie: parts.join('; ') };
  if (tokens.csrfToken) headers['X-CSRF-Token'] = tokens.csrfToken;
  return { headers, ...extra };
}

export default function runFlow(users) {
  const user = users[__VU % users.length];

  // 01 — Login
  let tokens;
  group('01-login', () => {
    tokens = login(user);
  });

  if (!tokens?.accessToken) {
    randomSleep(1, 2);
    return;
  }

  // 02 — Create dossier (setup)
  let dossierId;
  group('02-create-dossier', () => {
    const payload = {
      name: `LT-Designer-${__VU}-${__ITER}-${Date.now()}`,
      description: 'Hồ sơ test designer endpoints',
      status: 'draft',
      visibility: 'private',
    };
    const res = http.post(
      `${BASE_URL}/v1/dossiers`,
      JSON.stringify(payload),
      authParams(tokens, { tags: { name: 'create_dossier' } })
    );
    if (res.status !== 200 && res.status !== 201) {
      console.error(`[create_dossier] HTTP ${res.status}: ${res.body}`);
    }
    check(res, {
      'create dossier: status 2xx': (r) => r.status === 200 || r.status === 201,
      'create dossier: has id': (r) => r.json('id') !== undefined,
    });
    dossierId = res.json('id') ?? null;
  });
  randomSleep(1, 2);

  if (!dossierId) {
    randomSleep(1, 2);
    return;
  }

  // 03 — GET graph
  group('03-get-graph', () => {
    const res = http.get(
      `${BASE_URL}/v2/dossiers/${dossierId}/graph`,
      authParams(tokens, { tags: { name: 'get_graph' } })
    );
    check(res, {
      'get_graph: status 200': (r) => r.status === 200,
    });
  });
  randomSleep(1, 2);

  // 04 — PUT graph
  group('04-update-graph', () => {
    const payload = {
      graph_data: JSON.stringify({ nodes: [], edges: [] }),
    };
    const res = http.put(
      `${BASE_URL}/v2/dossiers/${dossierId}/graph`,
      JSON.stringify(payload),
      authParams(tokens, { tags: { name: 'update_graph' } })
    );
    if (res.status !== 200) {
      console.error(`[update_graph] HTTP ${res.status}: ${res.body}`);
    }
    check(res, {
      'update_graph: status 200': (r) => r.status === 200,
    });
  });
  randomSleep(1, 2);

  // 05 — GET routing-guidance
  group('05-get-routing', () => {
    const res = http.get(
      `${BASE_URL}/v2/dossiers/${dossierId}/routing-guidance`,
      authParams(tokens, { tags: { name: 'get_routing' } })
    );
    check(res, {
      'get_routing: status 200': (r) => r.status === 200,
    });
  });
  randomSleep(1, 2);

  // 06 — PUT routing-guidance
  group('06-update-routing', () => {
    const payload = {
      prompt: 'Hướng dẫn định tuyến load test',
    };
    const res = http.put(
      `${BASE_URL}/v2/dossiers/${dossierId}/routing-guidance`,
      JSON.stringify(payload),
      authParams(tokens, { tags: { name: 'update_routing' } })
    );
    if (res.status !== 200) {
      console.error(`[update_routing] HTTP ${res.status}: ${res.body}`);
    }
    check(res, {
      'update_routing: status 200': (r) => r.status === 200,
    });
  });
  randomSleep(1, 2);

  // 07 — GET validation-history
  group('07-get-validation-history', () => {
    const res = http.get(
      `${BASE_URL}/v2/dossiers/${dossierId}/validation-history`,
      authParams(tokens, { tags: { name: 'get_validation_history' } })
    );
    check(res, {
      'get_validation_history: status 200': (r) => r.status === 200,
    });
  });
  randomSleep(1, 2);

  // 08 — POST pool/upload (multipart)
  let fileId = null;
  group('08-pool-upload', () => {
    if (!sampleFileContent) {
      console.warn('[pool_upload] sample.pdf not found — skipping upload step');
      return;
    }
    const formData = {
      file: http.file(sampleFileContent, 'sample.pdf', 'application/pdf'),
    };
    const res = http.post(
      `${BASE_URL}/v2/dossiers/${dossierId}/pool/upload`,
      formData,
      uploadParams(tokens, { tags: { name: 'pool_upload' } })
    );
    if (res.status !== 200) {
      console.error(`[pool_upload] HTTP ${res.status}: ${res.body}`);
    }
    check(res, {
      'pool_upload: status 200': (r) => r.status === 200,
      'pool_upload: has id': (r) => r.json('id') !== undefined,
    });
    fileId = res.json('id') ?? null;
  });
  randomSleep(2, 4);

  // 09 — GET pool
  group('09-get-pool', () => {
    const res = http.get(
      `${BASE_URL}/v2/dossiers/${dossierId}/pool`,
      authParams(tokens, { tags: { name: 'get_pool' } })
    );
    check(res, {
      'get_pool: status 200': (r) => r.status === 200,
    });
    // Fallback: pick a fileId from pool listing if upload was skipped/failed
    if (!fileId) {
      const body = res.json() ?? {};
      const items = Array.isArray(body) ? body : (body.items ?? body.data ?? []);
      if (items.length > 0) {
        fileId = items[items.length - 1]?.id ?? null;
      }
    }
  });
  randomSleep(1, 2);

  // Steps 10-15 require a valid fileId
  if (fileId) {
    // 10 — GET pool/{fileId}/preview
    group('10-pool-preview', () => {
      const res = http.get(
        `${BASE_URL}/v2/dossiers/${dossierId}/pool/${fileId}/preview`,
        authParams(tokens, { tags: { name: 'pool_preview' } })
      );
      check(res, {
        'pool_preview: status 200': (r) => r.status === 200,
      });
    });
    randomSleep(1, 2);

    // 11 — GET pool/{fileId}/content
    group('11-pool-content', () => {
      const res = http.get(
        `${BASE_URL}/v2/dossiers/${dossierId}/pool/${fileId}/content`,
        authParams(tokens, { tags: { name: 'pool_content' } })
      );
      check(res, {
        'pool_content: status 200': (r) => r.status === 200,
      });
    });
    randomSleep(1, 2);

    // 12 — POST pool/{fileId}/reconvert
    group('12-pool-reconvert', () => {
      const res = http.post(
        `${BASE_URL}/v2/dossiers/${dossierId}/pool/${fileId}/reconvert`,
        null,
        authParams(tokens, { tags: { name: 'pool_reconvert' } })
      );
      if (res.status !== 200) {
        console.error(`[pool_reconvert] HTTP ${res.status}: ${res.body}`);
      }
      check(res, {
        'pool_reconvert: status 200': (r) => r.status === 200,
      });
    });
    randomSleep(1, 2);

    // 13 — POST pool/{fileId}/resummarize
    // NOTE: server returns 400 when file processing is not yet complete (async trigger).
    // We mark 200 and 400 as expected so k6 does not count 400 in http_req_failed.
    group('13-pool-resummarize', () => {
      const params = authParams(tokens, { tags: { name: 'pool_resummarize' }, responseCallback: asyncExpected });
      const res = http.post(
        `${BASE_URL}/v2/dossiers/${dossierId}/pool/${fileId}/resummarize`,
        null,
        params
      );
      if (res.status !== 200 && res.status !== 400) {
        console.error(`[pool_resummarize] HTTP ${res.status}: ${res.body}`);
      }
      check(res, {
        'pool_resummarize: status 200 or 400 (not ready)': (r) => r.status === 200 || r.status === 400,
      });
    });
    randomSleep(1, 2);

    // 14 — PATCH pool/{fileId}/summary
    group('14-pool-patch-summary', () => {
      const payload = { summary: 'Tóm tắt test' };
      const res = http.patch(
        `${BASE_URL}/v2/dossiers/${dossierId}/pool/${fileId}/summary`,
        JSON.stringify(payload),
        authParams(tokens, { tags: { name: 'pool_patch_summary' } })
      );
      if (res.status !== 200) {
        console.error(`[pool_patch_summary] HTTP ${res.status}: ${res.body}`);
      }
      check(res, {
        'pool_patch_summary: status 200': (r) => r.status === 200,
      });
    });
    randomSleep(1, 2);

    // 15 — DELETE pool/{fileId}
    group('15-delete-pool-file', () => {
      const res = http.del(
        `${BASE_URL}/v2/dossiers/${dossierId}/pool/${fileId}`,
        null,
        authParams(tokens, { tags: { name: 'delete_pool_file' } })
      );
      check(res, {
        'delete_pool_file: status 200': (r) => r.status === 200,
      });
    });
    randomSleep(1, 2);
  }

  // 16 — DELETE dossier (cleanup)
  group('16-delete-dossier', () => {
    const res = http.del(
      `${BASE_URL}/v1/dossiers/${dossierId}`,
      null,
      authParams(tokens, { tags: { name: 'delete_dossier' } })
    );
    check(res, {
      'delete_dossier: status 200': (r) => r.status === 200,
    });
  });
  randomSleep(1, 3);
}
