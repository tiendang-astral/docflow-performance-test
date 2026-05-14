/**
 * Endpoints Pipeline — Soak Test
 * Mục tiêu: phát hiện memory leak, connection leak khi tải kéo dài.
 *
 * Run:
 *   k6 run tests/endpoints/pipeline/soak.js
 *   k6 run -e BASE_URL=http://staging:29002/api tests/endpoints/pipeline/soak.js
 */

import { SharedArray } from 'k6/data';
import runFlow from '../../../endpoints/pipeline.flow.js';
import { buildSummary } from '../../../lib/report.js';

const users = new SharedArray('users', function () {
  return JSON.parse(open('../../../data/users.json'));
});

export const options = {
  stages: [
    { duration: '5m', target: 20 },
    { duration: '2h', target: 20 },
    { duration: '5m', target: 0  },
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<2000'],
    'http_req_duration{name:pipeline_list_tasks}': ['p(95)<1000'],
    'http_req_duration{name:pipeline_process}':    ['p(95)<5000'],
    'http_req_duration{name:pipeline_get_task}':   ['p(95)<1000'],
  },
};

export default function () {
  runFlow(users);
}

export const handleSummary = buildSummary('pipeline-soak');
