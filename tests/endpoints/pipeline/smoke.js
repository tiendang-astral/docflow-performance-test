/**
 * Endpoints Pipeline — Smoke Test
 * Mục tiêu: xác nhận script và môi trường hoạt động đúng với tải tối thiểu.
 *
 * Run:
 *   k6 run tests/endpoints/pipeline/smoke.js
 *   k6 run -e BASE_URL=http://staging:29002/api tests/endpoints/pipeline/smoke.js
 */

import { SharedArray } from 'k6/data';
import runFlow from '../../../endpoints/pipeline.flow.js';
import { buildSummary } from '../../../lib/report.js';

const users = new SharedArray('users', function () {
  return JSON.parse(open('../../../data/users.json'));
});

export const options = {
  vus: 1,
  duration: '10s',
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{name:login}':                    ['p(95)<800'],
    'http_req_duration{name:csrf}':                     ['p(95)<800'],
    'http_req_duration{name:pipeline_list_tasks}':      ['p(95)<1000'],
    'http_req_duration{name:pipeline_create_dossier}':  ['p(95)<1200'],
    'http_req_duration{name:pipeline_process}':         ['p(95)<5000'],
    'http_req_duration{name:pipeline_get_task}':        ['p(95)<1000'],
    'http_req_duration{name:pipeline_delete_dossier}':  ['p(95)<1200'],
  },
};

export default function () {
  runFlow(users);
}

export const handleSummary = buildSummary('pipeline-smoke');
