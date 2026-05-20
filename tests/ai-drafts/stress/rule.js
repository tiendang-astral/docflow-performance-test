/**
 * Stress test — POST /v1/ai/generate-rule-draft
 *
 * ⚠️ LLM endpoint = EXPENSIVE. Recommend MAX_VU thấp (5-20).
 *
 * Chạy:
 *   k6 run -e MAX_VU=10 tests/ai-drafts/stress/rule.js
 *   k6 run tests/ai-drafts/stress/rule.js              # full ramp (cẩn thận)
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';

import { login, authParams } from '../../../lib/auth.js';
import { stages } from '../../../lib/stages.js';
import { buildSummary } from '../../../lib/report.js';
import {
  getAdminUser,
  validateRuleDraft,
  RULE_PROMPTS,
  RULE_DRAFT_URL,
} from '../../../lib/ai-drafts-helper.js';
import { randomIntBetween } from '../../../lib/utils.js';

const users = new SharedArray('users', () =>
  JSON.parse(open('../../../data/seed/users.json'))
);

export const options = {
  stages: stages.stress,
  thresholds: {
    checks: ['rate>0.90'],
    http_req_failed: ['rate<0.10'],
    'http_req_duration{name:ai_rule_draft}': ['p(95)<30000'],
  },
};

export function setup() {
  const admin = getAdminUser(users);
  const tokens = login(admin);
  if (!tokens.accessToken) throw new Error(`login failed for ${admin.username}`);
  return { tokens };
}

export default function ({ tokens }) {
  const prompt = RULE_PROMPTS[randomIntBetween(0, RULE_PROMPTS.length - 1)];

  const res = http.post(RULE_DRAFT_URL,
    JSON.stringify({ text: prompt }),
    authParams(tokens, { tags: { name: 'ai_rule_draft' }, timeout: '90s' })
  );

  const httpOk = check(res, {
    'http: 200': (r) => r.status === 200,
  });
  if (!httpOk) {
    sleep(randomIntBetween(2, 5));
    return;
  }

  let body;
  try { body = res.json(); } catch (_) { body = null; }

  const v = body ? validateRuleDraft(body) : { ok: false, errors: ['no body'] };
  check(null, {
    'schema: AIRuleDraft hợp lệ':         () => v.ok,
    'schema: có name + condition':         () =>
      body && typeof body.name === 'string' && typeof body.condition === 'string' && body.condition.length > 0,
    'schema: rule_type = "prompt"':        () => body && body.rule_type === 'prompt',
    'schema: severity ∈ enum':             () =>
      body && ['error','warning','info','advisory'].includes(body.severity),
  });

  if (!v.ok && body) {
    console.error(`[validate] errors: ${v.errors.slice(0, 3).join(' | ')}`);
  }

  sleep(randomIntBetween(2, 5));
}

export const handleSummary = buildSummary('ai-rule-draft-stress');
