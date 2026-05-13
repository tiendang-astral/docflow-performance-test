/**
 * Dossiers — Load Test
 * Mục tiêu: kiểm tra hành vi ở mức tải thông thường.
 *
 * Run:
 *   k6 run tests/endpoints/dossiers/load.js
 *   k6 run -e BASE_URL=http://staging:29002/api tests/endpoints/dossiers/load.js
 */

import { SharedArray } from 'k6/data';
import runFlow from '../../../endpoints/dossiers.flow.js';
import { buildSummary } from '../../../lib/report.js';

const users = new SharedArray('users', function () {
  return JSON.parse(open('../../../data/users.json'));
});

export const options = {
  stages: [
    { duration: '2m',  target: 20 },
    { duration: '15m', target: 20 },
    { duration: '3m',  target: 0  },
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1000'],
    'http_req_duration{name:login}':               ['p(95)<800'],
    'http_req_duration{name:list_dossiers}':       ['p(95)<1000'],
    'http_req_duration{name:create_dossier}':      ['p(95)<1200'],
    'http_req_duration{name:get_dossier}':         ['p(95)<1200'],
    'http_req_duration{name:update_dossier}':      ['p(95)<1200'],
    'http_req_duration{name:update_visibility}':   ['p(95)<1200'],
    'http_req_duration{name:get_dossier_templates}': ['p(95)<1200'],
    'http_req_duration{name:get_dossier_rules}':   ['p(95)<1200'],
    'http_req_duration{name:delete_dossier}':      ['p(95)<1200'],
  },
};

export default function () {
  runFlow(users);
}

export const handleSummary = buildSummary('dossiers-load');
