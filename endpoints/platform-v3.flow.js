/**
 * Platform V3 — Platform V3 APIs
 *
 * Steps:
 *   01  POST /api/v1/auth/login           — đăng nhập
 *   02  POST /api/v1/dossiers             — tạo hồ sơ (setup)
 *   03  POST /api/v3/uploads/init         — khởi tạo upload
 *   04  GET  /api/v3/dossiers/{id}/jobs   — xem danh sách jobs
 *   05  GET  /api/v3/jobs/{job_id}        — xem chi tiết job (nếu có)
 *   06  DELETE /api/v1/dossiers/{id}      — xoá hồ sơ (tự dọn dẹp)
 */

import http from 'k6/http';
import { check, group } from 'k6';
import { BASE_URL, login, authParams } from '../lib/auth.js';
import { randomSleep } from '../lib/utils.js';

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
      name: `LT-V3-${__VU}-${__ITER}-${Date.now()}`,
      description: 'Hồ sơ tạo bởi platform-v3 load test',
      tags: ['load-test'],
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

  group('03-v3-upload-init', () => {
    const payload = {
      dossier_id: dossierId,
      filename: 'test.pdf',
      size_bytes: 1024,
      mime_type: 'application/pdf',
    };
    const res = http.post(
      `${BASE_URL}/v3/uploads/init`,
      JSON.stringify(payload),
      authParams(tokens, { tags: { name: 'v3_upload_init' } })
    );
    if (res.status !== 200 && res.status !== 201 && res.status !== 422) {
      console.error(`[v3_upload_init] HTTP ${res.status}: ${res.body}`);
    }
    check(res, {
      'v3 upload init: status acceptable': (r) =>
        r.status === 200 || r.status === 201 || r.status === 422,
    });
  });
  randomSleep(1, 2);

  let jobs = [];
  group('04-v3-list-jobs', () => {
    const res = http.get(
      `${BASE_URL}/v3/dossiers/${dossierId}/jobs`,
      authParams(tokens, { tags: { name: 'v3_list_jobs' } })
    );
    check(res, {
      'v3 list jobs: status 200': (r) => r.status === 200,
    });
    try {
      const body = res.json();
      if (Array.isArray(body)) {
        jobs = body;
      } else if (Array.isArray(body?.items)) {
        jobs = body.items;
      }
    } catch (_) {
      // non-JSON response — leave jobs empty
    }
  });
  randomSleep(1, 2);

  if (jobs.length > 0) {
    group('05-v3-get-first-job', () => {
      const res = http.get(
        `${BASE_URL}/v3/jobs/${jobs[0].id}`,
        authParams(tokens, { tags: { name: 'v3_get_job' } })
      );
      check(res, {
        'v3 get job: status 200': (r) => r.status === 200,
        'v3 get job: has id': (r) => r.json('id') !== undefined,
      });
    });
    randomSleep(1, 2);
  }

  group('06-delete-dossier', () => {
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
