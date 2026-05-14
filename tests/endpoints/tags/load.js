/**
 * Endpoint: tags — Load Test
 * Mục tiêu: kiểm tra hành vi ở mức tải thông thường.
 *
 * Run:
 *   k6 run tests/endpoints/tags/load.js
 *   k6 run -e BASE_URL=http://staging:29002/api tests/endpoints/tags/load.js
 */

import { SharedArray } from 'k6/data';
import runFlow from '../../../endpoints/tags.flow.js';
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
    'http_req_duration{name:login}':      ['p(95)<800'],
    'http_req_duration{name:list_tags}':  ['p(95)<1000'],
    'http_req_duration{name:create_tag}': ['p(95)<1200'],
    'http_req_duration{name:delete_tag}': ['p(95)<1200'],
  },
};

export default function () {
  runFlow(users);
}

export const handleSummary = buildSummary('tags-load');
