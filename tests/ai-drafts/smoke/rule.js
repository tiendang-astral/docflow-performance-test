/**
 * Smoke test — POST /v1/ai/generate-rule-draft
 *
 * Endpoint không persist → KHÔNG cần teardown.
 * Mỗi iteration gửi 1 prompt khác nhau và verify response đúng schema AIRuleDraft.
 *
 * Chạy: k6 run tests/ai-drafts/smoke/rule.js
 */

import http from 'k6/http';
import { check, sleep, fail } from 'k6';
import { SharedArray } from 'k6/data';

import { login, authParams } from '../../../lib/auth.js';
import { buildSummary } from '../../../lib/report.js';
import {
  getAdminUser,
  validateRuleDraft,
  RULE_PROMPTS,
  RULE_DRAFT_URL,
} from '../../../lib/ai-drafts-helper.js';

const users = new SharedArray('users', () =>
  JSON.parse(open('../../../data/seed/users.json'))
);

export const options = {
  vus: 1,
  iterations: 1,
  duration: '60s',
  thresholds: {
    checks: ['rate>0.95'],
    'http_req_duration{name:ai_rule_draft}': ['p(95)<20000'],
  },
};

export function setup() {
  const admin = getAdminUser(users);
  const tokens = login(admin);
  if (!tokens.accessToken) throw new Error(`login failed for ${admin.username}`);
  return { tokens };
}

export default function ({ tokens }) {
  const prompt = RULE_PROMPTS[__ITER % RULE_PROMPTS.length];

  const res = http.post(RULE_DRAFT_URL,
    JSON.stringify({ text: prompt }),
    authParams(tokens, { tags: { name: 'ai_rule_draft' }, timeout: '60s' })
  );

  const httpOk = check(res, {
    'http: 200': (r) => r.status === 200,
  });
  if (!httpOk) {
    console.error(`[rule-draft] HTTP ${res.status}: ${(res.body || '').slice(0, 300)}`);
    sleep(1);
    return;
  }

  let body;
  try {
    body = res.json();
  } catch (e) {
    fail(`response không phải JSON: ${(res.body || '').slice(0, 200)}`);
  }

  const v = validateRuleDraft(body);
  check(null, {
    'schema: AIRuleDraft hợp lệ':       () => v.ok,
    'schema: có name':                   () => typeof body.name === 'string' && body.name.length > 0,
    'schema: có condition không rỗng':   () => typeof body.condition === 'string' && body.condition.length > 0,
    'schema: rule_type = "prompt"':      () => body.rule_type === 'prompt',
    'schema: severity ∈ enum hợp lệ':   () =>
      ['error','warning','info','advisory'].includes(body.severity),
    'schema: tags là array string': () =>
      Array.isArray(body.tags) && body.tags.every((t) => typeof t === 'string'),
  });

  if (!v.ok) {
    console.error(`[validate] errors:\n  - ${v.errors.join('\n  - ')}`);
    console.error(`[validate] response: ${JSON.stringify(body).slice(0, 500)}`);
  } else {
    console.log(`[ok] prompt="${prompt.slice(0, 40)}…" → name="${body.name}" severity=${body.severity}`);
  }

  sleep(2);
}

export const handleSummary = buildSummary('ai-rule-draft-smoke');
