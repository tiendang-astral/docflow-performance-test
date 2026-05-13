/**
 * Endpoints Assessment — Soak Test
 * Mục tiêu: phát hiện memory leak, connection leak khi tải kéo dài.
 *
 * Run:
 *   k6 run tests/endpoints/assessment/soak.js
 *   k6 run -e BASE_URL=http://staging:29002/api tests/endpoints/assessment/soak.js
 */

import { SharedArray } from 'k6/data';
import runFlow from '../../../endpoints/assessment.flow.js';
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
    'http_req_duration{name:assessment_list_dossiers}':  ['p(95)<1000'],
    'http_req_duration{name:assessment_status}':         ['p(95)<2000'],
    'http_req_duration{name:assessment_validate}':       ['p(95)<2000'],
    'http_req_duration{name:assessment_sync_dagster}':   ['p(95)<3000'],
  },
};

export default function () {
  runFlow(users);
}

export const handleSummary = buildSummary('assessment-soak');
