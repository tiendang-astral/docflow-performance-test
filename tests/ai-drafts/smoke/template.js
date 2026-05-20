/**
 * Smoke test — POST /v1/ai/generate-template-draft
 *
 * Endpoint không persist → KHÔNG cần teardown.
 * Mỗi iteration gửi 1 prompt khác nhau và verify response đúng schema AITemplateDraft.
 *
 * Chạy: k6 run tests/ai-drafts/smoke/template.js
 */

import http from 'k6/http';
import { check, sleep, fail } from 'k6';
import { SharedArray } from 'k6/data';

import { login, authParams } from '../../../lib/auth.js';
import { buildSummary } from '../../../lib/report.js';
import {
  getAdminUser,
  validateTemplateDraft,
  TEMPLATE_PROMPTS,
  TEMPLATE_DRAFT_URL,
} from '../../../lib/ai-drafts-helper.js';

const users = new SharedArray('users', () =>
  JSON.parse(open('../../../data/seed/users.json'))
);

export const options = {
  vus: 1,
  iterations: 1,
  duration: '60s',  // LLM endpoint chậm — cần thời gian để có vài iteration
  thresholds: {
    checks: ['rate>0.95'],
    // LLM thường mất 3-15s/request
    'http_req_duration{name:ai_template_draft}': ['p(95)<20000'],
  },
};

export function setup() {
  const admin = getAdminUser(users);
  const tokens = login(admin);
  if (!tokens.accessToken) throw new Error(`login failed for ${admin.username}`);
  return { tokens };
}

export default function ({ tokens }) {
  const prompt = TEMPLATE_PROMPTS[__ITER % TEMPLATE_PROMPTS.length];

  const res = http.post(TEMPLATE_DRAFT_URL,
    JSON.stringify({ text: prompt }),
    authParams(tokens, { tags: { name: 'ai_template_draft' }, timeout: '60s' })
  );

  // Validate HTTP + structure trong cùng check block
  const httpOk = check(res, {
    'http: 200': (r) => r.status === 200,
  });
  if (!httpOk) {
    console.error(`[template-draft] HTTP ${res.status}: ${(res.body || '').slice(0, 300)}`);
    sleep(1);
    return;
  }

  let body;
  try {
    body = res.json();
  } catch (e) {
    fail(`response không phải JSON: ${(res.body || '').slice(0, 200)}`);
  }

  const v = validateTemplateDraft(body);
  check(null, {
    'schema: AITemplateDraft hợp lệ':       () => v.ok,
    'schema: có name':                       () => typeof body.name === 'string' && body.name.length > 0,
    'schema: có ≥1 field':                   () => Array.isArray(body.fields) && body.fields.length >= 1,
    'schema: mọi field có field_id/name/type': () =>
      Array.isArray(body.fields) && body.fields.every((f) =>
        typeof f.field_id === 'string' && typeof f.field_name === 'string' && typeof f.field_type === 'string'
      ),
    'schema: field_type ∈ enum hợp lệ': () =>
      Array.isArray(body.fields) && body.fields.every((f) =>
        ['text','number','date','boolean','list','table'].includes(f.field_type)
      ),
    'schema: tags là array string': () =>
      Array.isArray(body.tags) && body.tags.every((t) => typeof t === 'string'),
  });

  if (!v.ok) {
    console.error(`[validate] errors:\n  - ${v.errors.join('\n  - ')}`);
    console.error(`[validate] response: ${JSON.stringify(body).slice(0, 500)}`);
  } else {
    console.log(`[ok] prompt="${prompt.slice(0, 40)}…" → name="${body.name}", ${body.fields.length} fields`);
  }

  sleep(2);
}

export const handleSummary = buildSummary('ai-template-draft-smoke');
