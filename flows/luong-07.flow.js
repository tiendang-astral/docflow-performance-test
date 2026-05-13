/**
 * Luồng 07 — Upload tài liệu vào kho dữ liệu
 *
 * Steps:
 *   01  POST /api/v1/auth/login                              — đăng nhập
 *   02  POST /api/v1/dossiers                                — tạo hồ sơ (setup)
 *   03  POST /api/v2/dossiers/{id}/pool/upload               — upload file vào kho
 *   04  GET  /api/v2/dossiers/{id}/pool                      — xem danh sách file
 *   05  GET  /api/v2/dossiers/{id}/pool/{fileId}/preview     — xem trước file
 *   06  POST /api/v2/dossiers/{id}/pool/{fileId}/reconvert   — chuyển đổi lại file
 *   07  DELETE /api/v2/dossiers/{id}/pool/{fileId}           — xoá file
 *   08  DELETE /api/v1/dossiers/{id}                         — xoá hồ sơ (tự dọn dẹp)
 *
 * Yêu cầu: data/fixtures/sample.pdf phải tồn tại.
 */

import http from 'k6/http';
import { check, group } from 'k6';
import { BASE_URL, login, authParams } from '../lib/auth.js';
import { randomSleep } from '../lib/utils.js';

const sampleFileContent = open('../data/fixtures/sample.pdf', 'b');

/** Build params cho multipart upload — không set Content-Type (để k6 tự set boundary). */
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

  let tokens;
  group('01-login', () => {
    tokens = login(user);
  });

  if (!tokens?.accessToken) {
    randomSleep(1, 2);
    return;
  }

  let dossierId;
  group('02-create-dossier', () => {
    const payload = {
      name: `LT-Upload-VU${__VU}-I${__ITER}-${Date.now()}`,
      description: 'Hồ sơ upload tạo bởi load test',
      tags: ['load-test'],
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

  let uploadedFileId;
  group('03-upload-file', () => {
    const formData = {
      file: http.file(sampleFileContent, 'sample.pdf', 'application/pdf'),
    };
    const res = http.post(
      `${BASE_URL}/v2/dossiers/${dossierId}/pool/upload`,
      formData,
      uploadParams(tokens, { tags: { name: 'upload_file' } })
    );
    if (res.status !== 200) {
      console.error(`[upload_file] HTTP ${res.status}: ${res.body}`);
    }
    check(res, {
      'upload file: status 200': (r) => r.status === 200,
      'upload file: has id': (r) => r.json('id') !== undefined,
    });
    uploadedFileId = res.json('id') ?? null;
  });
  randomSleep(2, 4);

  group('04-list-pool', () => {
    const res = http.get(
      `${BASE_URL}/v2/dossiers/${dossierId}/pool`,
      authParams(tokens, { tags: { name: 'list_pool' } })
    );
    check(res, {
      'list pool: status 200': (r) => r.status === 200,
    });
    if (!uploadedFileId) {
      const body = res.json() ?? {};
      const items = Array.isArray(body) ? body : (body.items ?? body.data ?? []);
      if (items.length > 0) {
        uploadedFileId = items[items.length - 1]?.id ?? null;
      }
    }
  });
  randomSleep(1, 2);

  if (uploadedFileId) {
    group('05-preview-file', () => {
      const res = http.get(
        `${BASE_URL}/v2/dossiers/${dossierId}/pool/${uploadedFileId}/preview`,
        authParams(tokens, { tags: { name: 'preview_file' } })
      );
      check(res, {
        'preview file: status 200': (r) => r.status === 200,
      });
    });
    randomSleep(1, 2);

    group('06-reconvert-file', () => {
      const res = http.post(
        `${BASE_URL}/v2/dossiers/${dossierId}/pool/${uploadedFileId}/reconvert`,
        null,
        authParams(tokens, { tags: { name: 'reconvert_file' } })
      );
      if (res.status !== 200) {
        console.error(`[reconvert_file] HTTP ${res.status}: ${res.body}`);
      }
      check(res, {
        'reconvert file: status 200': (r) => r.status === 200,
      });
    });
    randomSleep(1, 2);

    group('07-delete-pool-file', () => {
      const res = http.del(
        `${BASE_URL}/v2/dossiers/${dossierId}/pool/${uploadedFileId}`,
        null,
        authParams(tokens, { tags: { name: 'delete_pool_file' } })
      );
      check(res, {
        'delete pool file: status 200': (r) => r.status === 200,
      });
    });
    randomSleep(1, 2);
  }

  group('08-delete-dossier', () => {
    const res = http.del(
      `${BASE_URL}/v1/dossiers/${dossierId}`,
      null,
      authParams(tokens, { tags: { name: 'delete_dossier' } })
    );
    check(res, {
      'delete dossier: status 200': (r) => r.status === 200,
    });
  });
  randomSleep(1, 3);
}
