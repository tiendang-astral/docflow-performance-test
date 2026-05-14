/**
 * Endpoints — Pipeline Integration
 *
 * Steps:
 *   01  POST /api/v1/auth/login               — đăng nhập
 *   02  GET  /api/v1/pipeline/tasks           — danh sách pipeline tasks
 *   03  POST /api/v1/dossiers                 — tạo hồ sơ (setup cho process)
 *   04  POST /api/v1/pipeline/process         — khởi chạy pipeline (accept 200/201/422)
 *   05  GET  /api/v1/pipeline/tasks           — list lại để kiểm tra task được tạo
 *   06  DELETE /api/v1/dossiers/{dossierId}  — xoá hồ sơ (cleanup)
 *
 * Note: pipeline/process may return 422 if dossier has no uploaded documents.
 * Accept 200/201/422 as OK for load test purposes.
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

  group('02-pipeline-list-tasks', () => {
    const res = http.get(
      `${BASE_URL}/v1/pipeline/tasks`,
      authParams(tokens, { tags: { name: 'pipeline_list_tasks' } })
    );
    check(res, {
      'pipeline list tasks: status 200': (r) => r.status === 200,
    });
  });
  randomSleep(1, 2);

  let dossierId;
  group('03-create-dossier', () => {
    const payload = {
      name: `LT-Pipeline-${__VU}-${__ITER}-${Date.now()}`,
      description: 'Hồ sơ test pipeline',
      status: 'draft',
      visibility: 'private',
    };
    const res = http.post(
      `${BASE_URL}/v1/dossiers`,
      JSON.stringify(payload),
      authParams(tokens, { tags: { name: 'pipeline_create_dossier' } })
    );
    if (res.status !== 200 && res.status !== 201) {
      console.error(`[pipeline_create_dossier] HTTP ${res.status}: ${res.body}`);
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

  group('04-pipeline-process', () => {
    const res = http.post(
      `${BASE_URL}/v1/pipeline/process`,
      JSON.stringify({ dossier_id: dossierId }),
      authParams(tokens, { tags: { name: 'pipeline_process' } })
    );
    check(res, {
      'pipeline process: ok': (r) => r.status === 200 || r.status === 201 || r.status === 422,
    });
  });
  randomSleep(1, 2);

  group('05-pipeline-get-task', () => {
    const res = http.get(
      `${BASE_URL}/v1/pipeline/tasks`,
      authParams(tokens, { tags: { name: 'pipeline_get_task' } })
    );
    check(res, {
      'pipeline get task: status 200': (r) => r.status === 200,
    });
  });
  randomSleep(1, 2);

  group('06-delete-dossier', () => {
    const res = http.del(
      `${BASE_URL}/v1/dossiers/${dossierId}`,
      null,
      authParams(tokens, { tags: { name: 'pipeline_delete_dossier' } })
    );
    check(res, {
      'delete dossier: status 200': (r) => r.status === 200,
    });
  });
  randomSleep(1, 3);
}
