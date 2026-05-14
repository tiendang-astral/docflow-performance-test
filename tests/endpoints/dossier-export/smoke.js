/**
 * Dossier Export — Smoke Test
 * Mục tiêu: xác nhận script và môi trường hoạt động đúng với tải tối thiểu.
 *
 * Run:
 *   k6 run tests/endpoints/dossier-export/smoke.js
 *   k6 run -e BASE_URL=http://staging:29002/api tests/endpoints/dossier-export/smoke.js
 */

import { SharedArray } from 'k6/data';
import runFlow from '../../../endpoints/dossier-export.flow.js';
import { buildSummary } from '../../../lib/report.js';

const users = new SharedArray('users', function () {
  return JSON.parse(open('../../../data/users.json'));
});

export const options = {
  vus: 1,
  duration: '10s',
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{name:login}':          ['p(95)<800'],
    'http_req_duration{name:csrf}':           ['p(95)<800'],
    'http_req_duration{name:create_dossier}': ['p(95)<1200'],
    'http_req_duration{name:export_dossier}': ['p(95)<3000'],
    'http_req_duration{name:delete_dossier}': ['p(95)<1200'],
  },
};

export default function () {
  runFlow(users);
}

export const handleSummary = buildSummary('dossier-export-smoke');
