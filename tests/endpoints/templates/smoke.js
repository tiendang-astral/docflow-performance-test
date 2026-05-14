/**
 * Endpoints — Templates — Smoke Test
 * Mục tiêu: xác nhận script và môi trường hoạt động đúng với tải tối thiểu.
 *
 * Run:
 *   k6 run tests/endpoints/templates/smoke.js
 *   k6 run -e BASE_URL=http://staging:29002/api tests/endpoints/templates/smoke.js
 */

import { SharedArray } from 'k6/data';
import runFlow from '../../../endpoints/templates.flow.js';
import { buildSummary } from '../../../lib/report.js';

const users = new SharedArray('users', function () {
  return JSON.parse(open('../../../data/users.json'));
});

export const options = {
  vus: 1,
  duration: '10s',
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{name:login}':                ['p(95)<800'],
    'http_req_duration{name:csrf}':                 ['p(95)<800'],
    'http_req_duration{name:list_templates}':       ['p(95)<1000'],
    'http_req_duration{name:create_template}':      ['p(95)<1200'],
    'http_req_duration{name:get_template}':         ['p(95)<1200'],
    'http_req_duration{name:update_template}':      ['p(95)<1200'],
    'http_req_duration{name:list_pending_templates}': ['p(95)<1000'],
    'http_req_duration{name:list_template_tags}':   ['p(95)<1000'],
    'http_req_duration{name:create_template_field}': ['p(95)<1200'],
    'http_req_duration{name:list_template_fields}': ['p(95)<1000'],
    'http_req_duration{name:patch_template_tags}':  ['p(95)<1200'],
    'http_req_duration{name:delete_template}':      ['p(95)<1200'],
  },
};

export default function () {
  runFlow(users);
}

export const handleSummary = buildSummary('templates-smoke');
