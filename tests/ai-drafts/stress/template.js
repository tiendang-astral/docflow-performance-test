/**
 * Stress test — POST /v1/ai/generate-template-draft
 *
 * ⚠️ LLM endpoint = EXPENSIVE + có thể vướng rate-limit phía AI provider.
 * Khuyến nghị chạy với MAX_VU thấp (5-20) và monitor cost.
 *
 * Mỗi iteration:
 *   - Gửi prompt random
 *   - Verify schema AITemplateDraft đúng định dạng
 *
 * Chạy:
 *   k6 run -e MAX_VU=10 tests/ai-drafts/stress/template.js
 *   k6 run tests/ai-drafts/stress/template.js          # full ramp 200 VU (cẩn thận!)
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';

import { login, authParams } from '../../../lib/auth.js';
import { stages } from '../../../lib/stages.js';
import { buildSummary } from '../../../lib/report.js';
import {
  getAdminUser,
  validateTemplateDraft,
  TEMPLATE_PROMPTS,
  TEMPLATE_DRAFT_URL,
} from '../../../lib/ai-drafts-helper.js';
import { randomIntBetween } from '../../../lib/utils.js';

const users = new SharedArray('users', () =>
  JSON.parse(open('../../../data/seed/users.json'))
);

export const options = {
  stages: stages.stress,
  thresholds: {
    checks: ['rate>0.90'],            // LLM dễ bị flaky → tolerance cao hơn
    http_req_failed: ['rate<0.10'],
    'http_req_duration{name:ai_template_draft}': ['p(95)<30000'],
  },
};

export function setup() {
  const admin = getAdminUser(users);
  const tokens = login(admin);
  if (!tokens.accessToken) throw new Error(`login failed for ${admin.username}`);
  return { tokens };
}

export default function ({ tokens }) {
  const prompt = TEMPLATE_PROMPTS[randomIntBetween(0, TEMPLATE_PROMPTS.length - 1)];

  const res = http.post(TEMPLATE_DRAFT_URL,
    JSON.stringify({ text: prompt }),
    authParams(tokens, { tags: { name: 'ai_template_draft' }, timeout: '90s' })
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

  const v = body ? validateTemplateDraft(body) : { ok: false, errors: ['no body'] };
  check(null, {
    'schema: AITemplateDraft hợp lệ':       () => v.ok,
    'schema: có name + ≥1 field':           () =>
      body && typeof body.name === 'string' && Array.isArray(body.fields) && body.fields.length >= 1,
    'schema: field_type ∈ enum':            () =>
      body && Array.isArray(body.fields) && body.fields.every((f) =>
        ['text','number','date','boolean','list','table'].includes(f.field_type)),
  });

  if (!v.ok && body) {
    console.error(`[validate] errors: ${v.errors.slice(0, 3).join(' | ')}`);
  }

  sleep(randomIntBetween(2, 5));   // LLM expensive → giãn cách
}

export const handleSummary = buildSummary('ai-template-draft-stress');
