/**
 * Designer Endpoints — Soak Test
 * Mục tiêu: phát hiện rò rỉ bộ nhớ, kết nối, hoặc tắc nghẽn hàng đợi dưới tải duy trì của nhóm endpoint designer.
 *
 * Run:
 *   k6 run tests/endpoints/designer/soak.js
 *   k6 run -e BASE_URL=http://staging:29002/api tests/endpoints/designer/soak.js
 */

import { SharedArray } from 'k6/data';
import runFlow from '../../../endpoints/designer.flow.js';
import { buildSummary } from '../../../lib/report.js';

const users = new SharedArray('users', function () {
  return JSON.parse(open('../../../data/users.json'));
});

export const options = {
  stages: [
    { duration: '5m', target: 20 },   // ramp up
    { duration: '2h', target: 20 },   // sustained load
    { duration: '5m', target: 0  },   // ramp down
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<2000'],
    'http_req_duration{name:login}':                ['p(95)<800'],
    'http_req_duration{name:csrf}':                 ['p(95)<800'],
    'http_req_duration{name:get_graph}':            ['p(95)<1000'],
    'http_req_duration{name:update_graph}':         ['p(95)<1200'],
    'http_req_duration{name:get_routing}':          ['p(95)<1000'],
    'http_req_duration{name:update_routing}':       ['p(95)<1200'],
    'http_req_duration{name:get_validation_history}': ['p(95)<1000'],
    'http_req_duration{name:pool_upload}':          ['p(95)<3000'],
    'http_req_duration{name:get_pool}':             ['p(95)<1000'],
    'http_req_duration{name:pool_preview}':         ['p(95)<2000'],
    'http_req_duration{name:pool_content}':         ['p(95)<2000'],
    'http_req_duration{name:pool_reconvert}':       ['p(95)<5000'],
    'http_req_duration{name:pool_resummarize}':     ['p(95)<5000'],
    'http_req_duration{name:pool_patch_summary}':   ['p(95)<1200'],
    'http_req_duration{name:delete_pool_file}':     ['p(95)<1200'],
    'http_req_duration{name:delete_dossier}':       ['p(95)<1200'],
  },
};

export default function () {
  runFlow(users);
}

export const handleSummary = buildSummary('endpoints-designer-soak');
