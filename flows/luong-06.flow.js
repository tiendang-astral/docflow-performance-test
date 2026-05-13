/**
 * Luồng 06 — Thiết kế hồ sơ trên canvas
 *
 * Steps:
 *   01  POST /api/v1/auth/login                   — đăng nhập
 *   02  POST /api/v1/dossiers                      — tạo hồ sơ (setup)
 *   03  GET  /api/v1/templates?status=approved     — lấy biểu mẫu đã duyệt
 *   04  GET  /api/v1/rules?status=approved         — lấy quy tắc đã duyệt
 *   05  GET  /api/v2/dossiers/{id}/graph           — mở canvas hồ sơ
 *   06  PUT  /api/v2/dossiers/{id}/graph           — lưu canvas với nodes/edges
 *   07  GET  /api/v2/dossiers/{id}/graph           — kiểm tra canvas đã lưu
 *   08  DELETE /api/v1/dossiers/{id}               — xoá hồ sơ (tự dọn dẹp)
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
      name: `LT-Canvas-VU${__VU}-I${__ITER}-${Date.now()}`,
      description: 'Hồ sơ canvas tạo bởi load test',
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

  let approvedTemplates = [];
  group('03-list-approved-templates', () => {
    const res = http.get(
      `${BASE_URL}/v1/templates?status=approved&page=1&size=20`,
      authParams(tokens, { tags: { name: 'list_approved_templates' } })
    );
    check(res, {
      'list approved templates: status 200': (r) => r.status === 200,
    });
    approvedTemplates = res.json('items') ?? [];
  });
  randomSleep(1, 2);

  let approvedRules = [];
  group('04-list-approved-rules', () => {
    const res = http.get(
      `${BASE_URL}/v1/rules?status=approved&page=1&size=20`,
      authParams(tokens, { tags: { name: 'list_approved_rules' } })
    );
    check(res, {
      'list approved rules: status 200': (r) => r.status === 200,
    });
    approvedRules = res.json('items') ?? [];
  });
  randomSleep(1, 2);

  group('05-get-canvas', () => {
    const res = http.get(
      `${BASE_URL}/v2/dossiers/${dossierId}/graph`,
      authParams(tokens, { tags: { name: 'get_canvas' } })
    );
    check(res, {
      'get canvas: status 200': (r) => r.status === 200,
      'get canvas: has dossier_id': (r) => r.json('dossier_id') !== undefined,
    });
  });
  randomSleep(1, 2);

  group('06-save-canvas', () => {
    const nodes = [];
    if (approvedTemplates.length > 0) {
      nodes.push({
        id: `form-node-${approvedTemplates[0].id}`,
        type: 'form',
        data: { templateId: approvedTemplates[0].id },
        position: { x: 100, y: 200 },
      });
    }
    if (approvedRules.length > 0) {
      nodes.push({
        id: `rule-node-${approvedRules[0].id}`,
        type: 'rule',
        data: { ruleId: approvedRules[0].id },
        position: { x: 400, y: 200 },
      });
    }
    const edges = nodes.length === 2
      ? [{ id: 'e1', source: nodes[1].id, target: nodes[0].id }]
      : [];

    const graphData = JSON.stringify({ nodes, edges });
    const payload = { graph_data: graphData };
    const res = http.put(
      `${BASE_URL}/v2/dossiers/${dossierId}/graph`,
      JSON.stringify(payload),
      authParams(tokens, { tags: { name: 'save_canvas' } })
    );
    if (res.status !== 200) {
      console.error(`[save_canvas] HTTP ${res.status}: ${res.body}`);
    }
    check(res, {
      'save canvas: status 200': (r) => r.status === 200,
      'save canvas: has dossier_id': (r) => r.json('dossier_id') !== undefined,
    });
  });
  randomSleep(1, 2);

  group('07-verify-canvas', () => {
    const res = http.get(
      `${BASE_URL}/v2/dossiers/${dossierId}/graph`,
      authParams(tokens, { tags: { name: 'verify_canvas' } })
    );
    check(res, {
      'verify canvas: status 200': (r) => r.status === 200,
      'verify canvas: has dossier_id': (r) => r.json('dossier_id') !== undefined,
    });
  });
  randomSleep(1, 2);

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
