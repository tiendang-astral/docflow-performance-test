/**
 * Endpoints — Assessment & Processing
 *
 * Steps:
 *   01  POST /api/v1/auth/login                                    — đăng nhập
 *   02  GET  /api/v1/assessment/dossiers                           — danh sách hồ sơ assessment
 *   03  POST /api/v1/dossiers                                      — tạo hồ sơ (setup)
 *   04  GET  /api/v1/assessment/{dossierId}/status                 — trạng thái assessment
 *   05  POST /api/v1/assessment/{dossierId}/validate               — validate hồ sơ
 *   06  POST /api/v1/assessment/{dossierId}/sync-dagster-status    — đồng bộ dagster
 *   07  DELETE /api/v1/dossiers/{dossierId}                       — xoá hồ sơ (cleanup)
 *
 * Note: assessment endpoints may return 404/422 when dossier has no processing data.
 * Accept 200/404/422 as OK for load test purposes.
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

  group('02-assessment-list', () => {
    const res = http.get(
      `${BASE_URL}/v1/assessment/dossiers`,
      authParams(tokens, { tags: { name: 'assessment_list_dossiers' } })
    );
    check(res, {
      'assessment list: status 200': (r) => r.status === 200,
    });
  });
  randomSleep(1, 2);

  let dossierId;
  group('03-create-dossier', () => {
    const payload = {
      name: `LT-Assessment-${__VU}-${__ITER}-${Date.now()}`,
      description: 'Hồ sơ test assessment',
      status: 'draft',
      visibility: 'private',
    };
    const res = http.post(
      `${BASE_URL}/v1/dossiers`,
      JSON.stringify(payload),
      authParams(tokens, { tags: { name: 'assessment_create_dossier' } })
    );
    if (res.status !== 200 && res.status !== 201) {
      console.error(`[assessment_create_dossier] HTTP ${res.status}: ${res.body}`);
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

  group('04-assessment-status', () => {
    const res = http.get(
      `${BASE_URL}/v1/assessment/${dossierId}/status`,
      authParams(tokens, { tags: { name: 'assessment_status' } })
    );
    check(res, {
      'assessment status: ok': (r) => r.status === 200 || r.status === 404 || r.status === 422,
    });
  });
  randomSleep(1, 2);

  group('05-assessment-validate', () => {
    const res = http.post(
      `${BASE_URL}/v1/assessment/${dossierId}/validate`,
      JSON.stringify({}),
      authParams(tokens, { tags: { name: 'assessment_validate' } })
    );
    check(res, {
      'assessment validate: ok': (r) => r.status === 200 || r.status === 404 || r.status === 422,
    });
  });
  randomSleep(1, 2);

  group('06-assessment-sync-dagster', () => {
    const res = http.post(
      `${BASE_URL}/v1/assessment/${dossierId}/sync-dagster-status`,
      JSON.stringify({}),
      authParams(tokens, { tags: { name: 'assessment_sync_dagster' } })
    );
    check(res, {
      'assessment sync-dagster: ok': (r) => r.status === 200 || r.status === 404 || r.status === 422,
    });
  });
  randomSleep(1, 2);

  group('07-delete-dossier', () => {
    const res = http.del(
      `${BASE_URL}/v1/dossiers/${dossierId}`,
      null,
      authParams(tokens, { tags: { name: 'assessment_delete_dossier' } })
    );
    check(res, {
      'delete dossier: status 200': (r) => r.status === 200,
    });
  });
  randomSleep(1, 3);
}
