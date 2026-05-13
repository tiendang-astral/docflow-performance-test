# Write k6 Tests — Flow $ARGUMENTS

Generate the flow file and 5 k6 test wrapper files for DocFlow flow number **$ARGUMENTS**.
Run all bash commands and reads in parallel wherever possible.

---

## Step 1 — Read the flow document

Find and read the flow file. The number may be given as `1` or `01`.

```bash
ls docs/luong-$(printf '%02d' $ARGUMENTS)-*.md 2>/dev/null
```

Read the file found. Extract:
- Flow name (from the `#` heading)
- All API endpoints from the **"API/Action cần test bằng k6"** section
- Preconditions
- Test steps and expected results
- Variants from **"Biến thể cần test"** (if present)

---

## Step 2 — Read context (parallel)

Read all four sources at the same time:

1. `data/users.json` — test accounts list
2. `docs/.env` — note `NEXT_PUBLIC_API_BASE_URL` as the BASE_URL default value
3. `lib/auth.js` — understand the login/authParams/BASE_URL pattern already in use
4. Search `docs/api.json` for each endpoint path from step 1 to find HTTP method, required request body fields, and expected response shape.

Use Python to parse api.json properly:
```bash
python3 -c "
import json
with open('docs/api.json') as f: d = json.load(f)
paths = d.get('paths', {})
targets = ['/forms', '/departments', '/canvases']  # replace with actual paths from step 1
for p in targets:
    if p in paths:
        print(p, list(paths[p].keys()))
        for method, op in paths[p].items():
            print(' ', method, op.get('requestBody', {}).get('content', {}).keys())
            print('  responses:', list(op.get('responses', {}).keys()))
"
```

Also check the OpenAPI spec root for the server prefix:
```bash
python3 -c "import json,sys; d=json.load(open('docs/api.json')); print(d.get('servers', d.get('basePath', 'NOT FOUND')))"
```

---

## Step 3 — Create output directories

```bash
mkdir -p tests/luong-$(printf '%02d' $ARGUMENTS)
```

(The `flows/` directory already exists — no mkdir needed.)

---

## Step 4 — Write 6 files

### File 0 — `flows/luong-{nn}.flow.js`

This is the core logic file. All 5 test wrappers import from it.

```javascript
/**
 * Luồng {nn} — {Flow Name}
 *
 * Steps:
 *   01  METHOD /api/v1/path   — description
 *   ...
 */

import http from 'k6/http';
import { check, group } from 'k6';
import { BASE_URL, login, authParams } from '../lib/auth.js';
import { randomSleep } from '../lib/utils.js';

export default function runFlow(users) {
  const user = users[__VU % users.length];

  let tokens;
  group('01-login', () => {
    tokens = login(user);
  });

  if (!tokens?.accessToken) {
    randomSleep(1, 2);
    return;
  }

  // Implement each flow step as a numbered group:
  group('02-step-name', () => {
    const res = http.get(
      `${BASE_URL}/v1/<path>`,
      authParams(tokens, { tags: { name: '<step_tag>' } })
    );
    check(res, {
      '<step>: status 200': (r) => r.status === 200,
      '<step>: has <key field>': (r) => r.json('<field>') !== undefined,
    });
  });
  randomSleep(1, 3);

  // ... more groups following flow steps
}
```

Rules for the flow file:
- Number groups `01-login`, `02-...`, `03-...` matching the flow doc steps.
- Every `http.*` call must include `tags: { name: '<snake_case_label>' }` in params — these labels are used in per-endpoint thresholds.
- Use `authParams(tokens, { tags: { name: '...' } })` for all authenticated calls.
- For mutating calls (POST/PUT/DELETE) use `authParams(tokens, { tags: { name: '...' } })` which automatically includes `X-CSRF-Token`.
- Pass JSON body as `JSON.stringify({...})` — `Content-Type: application/json` is included by `authParams`.
- Use `randomSleep(1, 3)` between groups (imported from `../lib/utils.js`).
- If the flow creates resources, capture IDs and expose a cleanup mechanism via a `setup`/`teardown`-compatible exported object, or accept a `teardownData` ref. For simple smoke-only teardown, export a `teardown` from the flow file.

---

### Files 1–5 — test wrappers in `tests/luong-{nn}/`

All 5 wrappers follow the same thin structure:

```javascript
/**
 * Luồng {nn} — {Test Type} Test
 * Mục tiêu: {one-line purpose in Vietnamese}
 *
 * Run:
 *   k6 run tests/luong-{nn}/{type}.js
 *   k6 run -e BASE_URL=http://staging:29002/api tests/luong-{nn}/{type}.js
 */

import { SharedArray } from 'k6/data';
import runFlow from '../../flows/luong-{nn}.flow.js';
import { buildSummary } from '../../lib/report.js';

const users = new SharedArray('users', function () {
  return JSON.parse(open('../../data/users.json'));
});

export const options = { /* see per-file spec below */ };

export default function () {
  runFlow(users);
}

export const handleSummary = buildSummary('luong-{nn}-{type}');
```

#### Per-endpoint thresholds

Use named-tag thresholds wherever the flow exposes distinct `tags.name` values:
```javascript
thresholds: {
  http_req_failed: ['rate<0.01'],
  'http_req_duration{name:login}':            ['p(95)<800'],
  'http_req_duration{name:list_forms}':       ['p(95)<1000'],
  'http_req_duration{name:create_form}':      ['p(95)<1200'],
  'http_req_duration{name:get_form}':         ['p(95)<1000'],
  // add one entry per tag used in the flow file
}
```

Reference thresholds by API type:
```
login/auth/csrf:    p(95) < 800ms
list/search GET:    p(95) < 1000ms
detail GET:         p(95) < 1200ms
create/update POST: p(95) < 1200ms
upload:             p(95) < 3000ms
extract/validate:   p(95) < 10000ms
export PDF:         p(95) < 5000ms
```

---

#### File 1 — `smoke.js`

Purpose: verify the script and environment work correctly with minimal load.

```javascript
export const options = {
  vus: 1,
  duration: '10s',
  thresholds: {
    http_req_failed: ['rate<0.01'],
    // per-endpoint thresholds for all tags in the flow
  },
};
```

---

#### File 2 — `load.js`

Purpose: verify behaviour under normal expected load.

```javascript
export const options = {
  stages: [
    { duration: '2m',  target: 20 },   // ramp up
    { duration: '15m', target: 20 },   // steady state
    { duration: '3m',  target: 0  },   // ramp down
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1000'],
    // per-endpoint thresholds for key tags
  },
};
```

---

#### File 3 — `stress.js`

Purpose: find the point where the system starts degrading.

```javascript
export const options = {
  stages: [
    { duration: '2m', target: 20  },
    { duration: '5m', target: 50  },
    { duration: '5m', target: 100 },
    { duration: '5m', target: 200 },
    { duration: '5m', target: 0   },
  ],
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<3000'],
  },
};
```

---

#### File 4 — `spike.js`

Purpose: verify behaviour under a sudden traffic spike.

```javascript
export const options = {
  stages: [
    { duration: '30s', target: 5   },  // baseline
    { duration: '30s', target: 100 },  // spike
    { duration: '1m',  target: 100 },  // hold spike
    { duration: '30s', target: 5   },  // recovery
    { duration: '30s', target: 0   },  // cool down
  ],
  thresholds: {
    http_req_failed: ['rate<0.10'],
    http_req_duration: ['p(95)<5000'],
  },
};
```

---

#### File 5 — `soak.js`

Purpose: detect memory leaks, connection leaks, or queue backlog under sustained load.

```javascript
export const options = {
  stages: [
    { duration: '5m', target: 20 },   // ramp up
    { duration: '2h', target: 20 },   // sustained load
    { duration: '5m', target: 0  },   // ramp down
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<2000'],
    // per-endpoint thresholds for key tags
  },
};
```

---

## Step 5 — Verify

After writing all 6 files, run:

```bash
ls -la flows/luong-$(printf '%02d' $ARGUMENTS).flow.js tests/luong-$(printf '%02d' $ARGUMENTS)/
```

Report what was created, which API endpoints and tag names the flow file uses, and note any endpoint whose schema could not be found in `docs/api.json`.
