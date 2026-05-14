/**
 * Admin — Admin Monitor
 *
 * Steps:
 *   01  POST /api/v1/auth/login                    — đăng nhập (admin)
 *   02  GET  /api/v1/admin/monitor/overview        — tổng quan hệ thống
 *   03  GET  /api/v1/admin/monitor/extraction      — theo dõi extraction
 *   04  GET  /api/v1/admin/monitor/validation      — theo dõi validation
 *   05  GET  /api/v1/admin/monitor/dossiers        — theo dõi dossiers
 *   06  GET  /api/v1/admin/monitor/pipeline        — theo dõi pipeline
 *   07  GET  /api/v1/admin/monitor/approval        — theo dõi approval
 *   08  GET  /api/v1/admin/monitor/activity        — lịch sử hoạt động
 */

import http from 'k6/http';
import { check, group } from 'k6';
import { BASE_URL, login, authParams } from '../lib/auth.js';
import { randomSleep, getUserByRole } from '../lib/utils.js';

export default function runFlow(users) {
  const user = getUserByRole(users, 'admin');

  let tokens;
  group('01-login', () => {
    tokens = login(user);
  });

  if (!tokens?.accessToken) {
    randomSleep(1, 2);
    return;
  }

  group('02-overview', () => {
    const res = http.get(
      `${BASE_URL}/v1/admin/monitor/overview`,
      authParams(tokens, { tags: { name: 'admin_overview' } })
    );
    check(res, {
      'admin overview: status 200': (r) => r.status === 200,
    });
  });
  randomSleep(1, 2);

  group('03-extraction', () => {
    const res = http.get(
      `${BASE_URL}/v1/admin/monitor/extraction`,
      authParams(tokens, { tags: { name: 'admin_extraction' } })
    );
    check(res, {
      'admin extraction: status 200': (r) => r.status === 200,
    });
  });
  randomSleep(1, 2);

  group('04-validation', () => {
    const res = http.get(
      `${BASE_URL}/v1/admin/monitor/validation`,
      authParams(tokens, { tags: { name: 'admin_validation' } })
    );
    check(res, {
      'admin validation: status 200': (r) => r.status === 200,
    });
  });
  randomSleep(1, 2);

  group('05-dossiers', () => {
    const res = http.get(
      `${BASE_URL}/v1/admin/monitor/dossiers`,
      authParams(tokens, { tags: { name: 'admin_dossiers' } })
    );
    check(res, {
      'admin dossiers: status 200': (r) => r.status === 200,
    });
  });
  randomSleep(1, 2);

  group('06-pipeline', () => {
    const res = http.get(
      `${BASE_URL}/v1/admin/monitor/pipeline`,
      authParams(tokens, { tags: { name: 'admin_pipeline' } })
    );
    check(res, {
      'admin pipeline: status 200': (r) => r.status === 200,
    });
  });
  randomSleep(1, 2);

  group('07-approval', () => {
    const res = http.get(
      `${BASE_URL}/v1/admin/monitor/approval`,
      authParams(tokens, { tags: { name: 'admin_approval' } })
    );
    check(res, {
      'admin approval: status 200': (r) => r.status === 200,
    });
  });
  randomSleep(1, 2);

  group('08-activity', () => {
    const res = http.get(
      `${BASE_URL}/v1/admin/monitor/activity`,
      authParams(tokens, { tags: { name: 'admin_activity' } })
    );
    check(res, {
      'admin activity: status 200': (r) => r.status === 200,
    });
  });
  randomSleep(1, 3);
}
