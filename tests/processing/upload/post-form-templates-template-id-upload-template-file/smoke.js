/**
 * upload / post-form-templates-template-id-upload-template-file — Smoke Test
 * POST /v1/upload/form-templates/{TEMPLATE_ID}/upload-template-file
 */

import http from 'k6/http';
import { check } from 'k6';
import { SharedArray } from 'k6/data';
import { BASE_URL, login, authParams } from '../../../../lib/auth.js';
import { getUser, getUserByRole, randomSleep } from '../../../../lib/utils.js';

const users = new SharedArray('users', function () {
  return JSON.parse(open('../../../../data/users.json'));
});

// data/ids.json: ID entity thật do scripts/seed.py tạo; rỗng nếu chưa seed.
const ids = (function () {
  try { return JSON.parse(open('../../../../data/ids.json')); }
  catch (e) { return {}; }
})();

export const options = {
  vus: 1,
  iterations: 1,  // smoke chỉ chạy 1 lần để DELETE/POST không phá state
  thresholds: {
    http_req_failed: ['rate<0.05'],
    'http_req_duration{name:upload_post_form_templates_template_id_upload_template_file}': ['p(95)<3000'],
  },
};

export function setup() {
  const user = getUser(users);
  const tokens = login(user);
  return { tokens };
}

export default function (data) {
  const TEMPLATE_ID = __ENV.TEMPLATE_ID || ids['template_id'] || '1';
  const body = __ENV.BODY_JSON ? __ENV.BODY_JSON : JSON.stringify({});
  const res = http.post(`${BASE_URL}/v1/upload/form-templates/${TEMPLATE_ID}/upload-template-file`, body, authParams(data.tokens, { tags: { name: 'upload_post_form_templates_template_id_upload_template_file' } }));
  check(res, {
    'upload_post_form_templates_template_id_upload_template_file: status 200/201': (r) => r.status === 200 || r.status === 201,
  });
  randomSleep(1, 2);
}
