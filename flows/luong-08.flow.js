/**
 * Luồng 08 — Gán file cho biểu mẫu
 *
 * Steps:
 *   01  POST /api/v1/auth/login                              — đăng nhập
 *   02  GET  /api/v1/templates?status=approved               — lấy biểu mẫu đã duyệt
 *   03  POST /api/v1/dossiers                                — tạo hồ sơ kèm template
 *   04  POST /api/v2/dossiers/{id}/pool/upload               — upload file vào kho
 *   05  GET  /api/v2/dossiers/{id}/pool                      — xem danh sách file
 *   06  POST /api/v2/dossiers/{id}/pool/{fileId}/assign      — gán file → tạo DossierForm
 *   07  GET  /api/v2/dossiers/{id}/forms/{formId}/content    — kiểm tra nội dung biểu mẫu
 *   08  DELETE /api/v1/dossiers/{id}                         — xoá hồ sơ (tự dọn dẹp)
 *
 * Yêu cầu: data/fixtures/sample.pdf phải tồn tại.
 */

import http from 'k6/http';
import { check, group } from 'k6';
import { BASE_URL, login, authParams } from '../lib/auth.js';
import { randomSleep } from '../lib/utils.js';

const sampleFileContent = open('../data/fixtures/sample.pdf', 'b');

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

  let approvedTemplateId;
  group('02-list-approved-templates', () => {
    const res = http.get(
      `${BASE_URL}/v1/templates?status=approved&page=1&size=20`,
      authParams(tokens, { tags: { name: 'list_approved_templates' } })
    );
    check(res, {
      'list approved templates: status 200': (r) => r.status === 200,
    });
    const items = res.json('items') ?? [];
    if (items.length > 0) {
      approvedTemplateId = items[__VU % items.length]?.id ?? items[0]?.id;
    }
  });
  randomSleep(1, 2);

  if (!approvedTemplateId) {
    randomSleep(1, 2);
    return;
  }

  let dossierId;
  group('03-create-dossier', () => {
    const payload = {
      name: `LT-Assign-VU${__VU}-I${__ITER}-${Date.now()}`,
      description: 'Hồ sơ gán file tạo bởi load test',
      tags: ['load-test'],
      template_ids: [approvedTemplateId],
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
  group('04-upload-file', () => {
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

  group('05-list-pool', () => {
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

  if (!uploadedFileId) {
    http.del(`${BASE_URL}/v1/dossiers/${dossierId}`, null, authParams(tokens, { tags: { name: 'delete_dossier' } }));
    randomSleep(1, 2);
    return;
  }

  // POST /pool/{fileId}/assign: tạo DossierForm và gán file, trả về DossierForm.id
  let dossierFormId;
  group('06-assign-file', () => {
    const res = http.post(
      `${BASE_URL}/v2/dossiers/${dossierId}/pool/${uploadedFileId}/assign?template_id=${approvedTemplateId}`,
      null,
      authParams(tokens, { tags: { name: 'assign_file' } })
    );
    if (res.status !== 200) {
      console.error(`[assign_file] HTTP ${res.status}: ${res.body}`);
    }
    check(res, {
      'assign file: status 200': (r) => r.status === 200,
      'assign file: has id': (r) => r.json('id') !== undefined,
    });
    dossierFormId = res.json('id') ?? null;
  });
  randomSleep(1, 2);

  if (dossierFormId) {
    group('07-get-form-content', () => {
      const res = http.get(
        `${BASE_URL}/v2/dossiers/${dossierId}/forms/${dossierFormId}/content`,
        authParams(tokens, { tags: { name: 'get_form_content' } })
      );
      check(res, {
        'get form content: status 200': (r) => r.status === 200,
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
