#!/usr/bin/env python3
"""
Sinh smoke.js + stress.js cho mỗi (method, path) trong docs/api.json.

Layout:  tests/<group>/<endpoint>/{smoke,stress}.js
  - group: 'auth', 'users', 'v2-dossiers', 'v3-dossiers', 'misc', ...
  - endpoint: '<method>-<slug-of-path-tail>'

Chạy:    python3 scripts/gen-endpoint-tests.py
"""

from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SPEC = ROOT / 'docs' / 'api.json'
TESTS_DIR = ROOT / 'tests'

HTTP_METHODS = ('get', 'post', 'put', 'delete', 'patch')

# Group → (category, group_alias). group_alias dùng để đổi tên folder con
# (vd dossiers→v1 để xếp vào dossier/v1). None giữ nguyên tên group.
CATEGORY_MAP: dict[str, tuple[str, str | None]] = {
    'auth':           ('identity',   None),
    'users':          ('identity',   None),
    'departments':    ('identity',   None),

    'templates':      ('form-rule',  None),
    'form-templates': ('form-rule',  None),
    'rules':          ('form-rule',  None),
    'tags':           ('form-rule',  None),

    'dossiers':       ('dossier',    'v1'),
    'v2-dossiers':    ('dossier',    'v2'),
    'v3-dossiers':    ('dossier',    'v3'),

    'upload':         ('processing', None),
    'v3-uploads':     ('processing', None),
    'ai':             ('processing', None),
    'extraction':     ('processing', None),
    'assessment':     ('processing', None),

    'admin':          ('admin',      'monitor'),
}

# Group bị bỏ hoàn toàn (không phải user interaction).
SKIP_GROUPS = {'pipeline', 'v3-jobs', 'api-keys', 'settings', 'misc'}

# Path cụ thể bị bỏ (internal sync, infra…).
SKIP_PATHS = {
    '/api/v1/assessment/{dossier_id}/sync-dagster-status',
}


def slugify(s: str) -> str:
    s = s.replace('{', '').replace('}', '')
    s = re.sub(r'[^A-Za-z0-9]+', '-', s).strip('-').lower()
    return s or 'root'


def status_check_for(method: str) -> tuple[str, str]:
    """Return (check_label, predicate_expr) phù hợp với HTTP method.

    POST           → status == 200 hoặc 201 (resource có thể được tạo).
    GET/PUT/PATCH/DELETE → status == 200.
    """
    m = method.lower()
    if m == 'post':
        return ('status 200/201', 'r.status === 200 || r.status === 201')
    return ('status 200', 'r.status === 200')


def group_and_tail(path: str) -> tuple[str, list[str]]:
    """
    Trả về (group, tail_segments).
      /api/v1/auth/login                     -> ('auth',         ['login'])
      /api/v1/users/{user_id}                -> ('users',        ['{user_id}'])
      /api/v1/users/{user_id}/activate       -> ('users',        ['{user_id}', 'activate'])
      /api/v2/dossiers/import/preview        -> ('v2-dossiers',  ['import', 'preview'])
      /api/v3/uploads/init                   -> ('v3-uploads',   ['init'])
      /health                                -> ('misc',         ['health'])
      /metrics                               -> ('misc',         ['metrics'])
    """
    segs = [s for s in path.split('/') if s]
    if len(segs) >= 3 and segs[0] == 'api' and segs[1] in ('v1', 'v2', 'v3'):
        version, group = segs[1], segs[2]
        tail = segs[3:]
        prefix = '' if version == 'v1' else f'{version}-'
        return f'{prefix}{group}', tail
    return 'misc', segs


def endpoint_name(method: str, tail: list[str], group: str = '') -> str:
    if not tail:
        # /api/v1/templates → get-templates / post-templates
        # group có dạng 'templates' hoặc 'v2-dossiers'; dùng phần cuối làm tên.
        base = group.rsplit('-', 1)[-1] if group else 'root'
        return f'{method}-{base}'
    return f'{method}-' + slugify('/'.join(tail))


def path_params(operation: dict, path_item: dict) -> list[str]:
    names = []
    seen = set()
    for src in (path_item.get('parameters') or [], operation.get('parameters') or []):
        for p in src:
            if p.get('in') == 'path' and p.get('name') and p['name'] not in seen:
                names.append(p['name'])
                seen.add(p['name'])
    # Cũng quét từ chính path
    return names


def env_var_for(param: str) -> str:
    return re.sub(r'[^A-Z0-9]+', '_', param.upper()).strip('_')


def default_value_for_param(param: str, schema_hint: str | None) -> str:
    if 'uuid' in param.lower() or schema_hint == 'uuid':
        return '00000000-0000-0000-0000-000000000000'
    if schema_hint == 'integer':
        return '1'
    return '1'


def resolve_ref(spec: dict, ref: str) -> dict | None:
    if not ref.startswith('#/'):
        return None
    node = spec
    for part in ref[2:].split('/'):
        if not isinstance(node, dict) or part not in node:
            return None
        node = node[part]
    return node if isinstance(node, dict) else None


def example_from_schema(spec: dict, schema: dict | None, depth: int = 0) -> object:
    if not isinstance(schema, dict) or depth > 4:
        return {}
    if '$ref' in schema:
        return example_from_schema(spec, resolve_ref(spec, schema['$ref']) or {}, depth + 1)
    if 'example' in schema:
        return schema['example']
    if 'default' in schema:
        return schema['default']
    t = schema.get('type')
    if isinstance(t, list):
        t = t[0]
    if t == 'object' or 'properties' in schema:
        out = {}
        props = schema.get('properties') or {}
        required = set(schema.get('required') or [])
        for k, v in props.items():
            if required and k not in required:
                continue
            out[k] = example_from_schema(spec, v, depth + 1)
        if not out and props:
            # nothing required → include first prop để body không rỗng
            k, v = next(iter(props.items()))
            out[k] = example_from_schema(spec, v, depth + 1)
        return out
    if t == 'array':
        return [example_from_schema(spec, schema.get('items') or {}, depth + 1)]
    if t == 'integer':
        return 0
    if t == 'number':
        return 0
    if t == 'boolean':
        return False
    if t == 'string':
        fmt = schema.get('format')
        if fmt == 'date-time':
            return '2026-01-01T00:00:00Z'
        if fmt == 'date':
            return '2026-01-01'
        if fmt == 'uuid':
            return '00000000-0000-0000-0000-000000000000'
        if 'enum' in schema and schema['enum']:
            return schema['enum'][0]
        return 'string'
    if 'anyOf' in schema and schema['anyOf']:
        return example_from_schema(spec, schema['anyOf'][0], depth + 1)
    if 'oneOf' in schema and schema['oneOf']:
        return example_from_schema(spec, schema['oneOf'][0], depth + 1)
    return {}


def get_request_body_example(spec: dict, operation: dict) -> object | None:
    rb = operation.get('requestBody')
    if not isinstance(rb, dict):
        return None
    content = (rb.get('content') or {})
    if 'application/json' in content:
        schema = content['application/json'].get('schema')
        if schema:
            return example_from_schema(spec, schema)
    return None


def build_path_template(path: str) -> tuple[str, list[tuple[str, str]], str]:
    """
    Trả về (template_for_template_literal, [(param_name, env_var)], base_var).
      /api/v1/users/{user_id}/activate
        -> ('/v1/users/${USER_ID}/activate', [('user_id', 'USER_ID')], 'BASE_URL')
      /health
        -> ('/health', [], 'ROOT_URL')   # không dùng BASE_URL vì /api đã nằm trong đó
    """
    if path.startswith('/api/'):
        rel = path[len('/api'):]
        base_var = 'BASE_URL'
    else:
        rel = path
        base_var = 'ROOT_URL'

    params: list[tuple[str, str]] = []

    def replace(match):
        name = match.group(1)
        env = env_var_for(name)
        params.append((name, env))
        return f'${{{env}}}'

    template = re.sub(r'\{([^}]+)\}', replace, rel)
    return template, params, base_var


def needs_admin(operation: dict, path: str) -> bool:
    summary = (operation.get('summary') or '').lower()
    desc = (operation.get('description') or '').lower()
    if 'admin' in summary or 'admin only' in desc or '/admin/' in path:
        return True
    return False


def smoke_template(*, group: str, endpoint: str, method: str, path_tpl: str,
                   params: list[tuple[str, str]], body_example: object | None,
                   tag_name: str, admin: bool, base_var: str = 'BASE_URL') -> str:
    levels = group.count('-') + 1  # for relative depth, not used here
    rel_root = '../../../..'  # tests/<category>/<group>/<endpoint>/ → project root
    user_picker = (
        "getUserByRole(users, 'admin')" if admin else 'getUser(users)'
    )
    param_lines = '\n'.join(
        f"  const {env} = __ENV.{env} || '{default_value_for_param(name, None)}';"
        for name, env in params
    )
    body_line = ''
    if method in ('post', 'put', 'patch'):
        body_line = (
            f"  const body = __ENV.BODY_JSON ? __ENV.BODY_JSON : "
            f"JSON.stringify({json.dumps(body_example if body_example is not None else {})});\n"
        )
    request_args = f"`${{{base_var}}}{path_tpl}`"
    if method in ('post', 'put', 'patch'):
        call = f"http.{method}({request_args}, body, authParams(data.tokens, {{ tags: {{ name: '{tag_name}' }} }}))"
    elif method == 'delete':
        call = f"http.del({request_args}, null, authParams(data.tokens, {{ tags: {{ name: '{tag_name}' }} }}))"
    else:
        call = f"http.{method}({request_args}, authParams(data.tokens, {{ tags: {{ name: '{tag_name}' }} }}))"

    check_label, check_predicate = status_check_for(method)

    base_import = base_var
    return f"""/**
 * {group} / {endpoint} — Smoke Test
 * {method.upper()} {path_tpl.replace('${', '{').replace('}', '}')}
 */

import http from 'k6/http';
import {{ check }} from 'k6';
import {{ SharedArray }} from 'k6/data';
import {{ {base_import}, login, authParams }} from '{rel_root}/lib/auth.js';
import {{ getUser, getUserByRole, randomSleep }} from '{rel_root}/lib/utils.js';

const users = new SharedArray('users', function () {{
  return JSON.parse(open('{rel_root}/data/users.json'));
}});

export const options = {{
  vus: 1,
  duration: '10s',
  thresholds: {{
    http_req_failed: ['rate<0.05'],
    'http_req_duration{{name:{tag_name}}}': ['p(95)<3000'],
  }},
}};

export function setup() {{
  const user = {user_picker};
  const tokens = login(user);
  return {{ tokens }};
}}

export default function (data) {{
{param_lines}
{body_line}  const res = {call};
  check(res, {{
    '{tag_name}: {check_label}': (r) => {check_predicate},
  }});
  randomSleep(1, 2);
}}
"""


def stress_template(*, category: str, group: str, endpoint: str, method: str, path_tpl: str,
                    params: list[tuple[str, str]], body_example: object | None,
                    tag_name: str, admin: bool, base_var: str = 'BASE_URL') -> str:
    rel_root = '../../../..'
    user_picker = (
        "getUserByRole(users, 'admin')" if admin else 'getUser(users)'
    )
    param_lines = '\n'.join(
        f"  const {env} = __ENV.{env} || '{default_value_for_param(name, None)}';"
        for name, env in params
    )
    body_line = ''
    if method in ('post', 'put', 'patch'):
        body_line = (
            f"  const body = __ENV.BODY_JSON ? __ENV.BODY_JSON : "
            f"JSON.stringify({json.dumps(body_example if body_example is not None else {})});\n"
        )
    request_args = f"`${{{base_var}}}{path_tpl}`"
    if method in ('post', 'put', 'patch'):
        call = f"http.{method}({request_args}, body, authParams(data.tokens, {{ tags: {{ name: '{tag_name}' }} }}))"
    elif method == 'delete':
        call = f"http.del({request_args}, null, authParams(data.tokens, {{ tags: {{ name: '{tag_name}' }} }}))"
    else:
        call = f"http.{method}({request_args}, authParams(data.tokens, {{ tags: {{ name: '{tag_name}' }} }}))"

    check_label, check_predicate = status_check_for(method)

    return f"""/**
 * {group} / {endpoint} — Stress Test
 * {method.upper()} {path_tpl.replace('${', '{').replace('}', '}')}
 *
 * Run:
 *   k6 run -e MAX_VU=100 tests/{category}/{group}/{endpoint}/stress.js
 */

import http from 'k6/http';
import {{ check }} from 'k6';
import {{ SharedArray }} from 'k6/data';
import {{ {base_var}, login, authParams }} from '{rel_root}/lib/auth.js';
import {{ getUser, getUserByRole, randomSleep }} from '{rel_root}/lib/utils.js';
import {{ buildSummary }} from '{rel_root}/lib/report.js';
import {{ stages }} from '{rel_root}/lib/stages.js';

const users = new SharedArray('users', function () {{
  return JSON.parse(open('{rel_root}/data/users.json'));
}});

export const options = {{
  stages: stages.stress,
  thresholds: {{
    http_req_failed: ['rate<0.10'],
    'http_req_duration{{name:{tag_name}}}': ['p(95)<5000'],
  }},
}};

export function setup() {{
  const user = {user_picker};
  const tokens = login(user);
  return {{ tokens }};
}}

export default function (data) {{
{param_lines}
{body_line}  const res = {call};
  check(res, {{
    '{tag_name}: {check_label}': (r) => {check_predicate},
  }});
  randomSleep(1, 2);
}}

export const handleSummary = buildSummary('{group}-{endpoint}-stress');
"""


def main() -> int:
    if not SPEC.exists():
        print(f'Spec not found: {SPEC}', file=sys.stderr)
        return 1
    spec = json.loads(SPEC.read_text())
    paths = spec.get('paths') or {}

    TESTS_DIR.mkdir(exist_ok=True)
    count = 0
    skipped = []

    for path, path_item in sorted(paths.items()):
        if not isinstance(path_item, dict):
            continue
        if path in SKIP_PATHS:
            skipped.append(path)
            continue
        for method, op in path_item.items():
            if method not in HTTP_METHODS:
                continue
            if not isinstance(op, dict):
                continue

            raw_group, tail = group_and_tail(path)
            if raw_group in SKIP_GROUPS:
                continue

            category, group_alias = CATEGORY_MAP.get(raw_group, (raw_group, None))
            group = group_alias or raw_group

            endpoint = endpoint_name(method, tail, raw_group)
            # Admin chỉ có endpoint /admin/monitor/*; sau khi rename group → 'monitor',
            # bỏ tiền tố 'monitor-' khỏi endpoint cho khỏi dư (get-monitor-overview → get-overview).
            if raw_group == 'admin' and endpoint.startswith(f'{method}-monitor-'):
                endpoint = f'{method}-' + endpoint[len(f'{method}-monitor-'):]

            params = path_params(op, path_item)
            params_pairs = [(p, env_var_for(p)) for p in params]
            body_example = get_request_body_example(spec, op) if method in ('post', 'put', 'patch') else None
            path_tpl, _, base_var = build_path_template(path)
            tag_name = f'{group}_{endpoint}'.replace('-', '_')
            admin = needs_admin(op, path)

            out_dir = TESTS_DIR / category / group / endpoint
            out_dir.mkdir(parents=True, exist_ok=True)

            smoke = smoke_template(
                group=group, endpoint=endpoint, method=method, path_tpl=path_tpl,
                params=params_pairs, body_example=body_example, tag_name=tag_name, admin=admin,
                base_var=base_var,
            )
            stress = stress_template(
                category=category, group=group, endpoint=endpoint, method=method, path_tpl=path_tpl,
                params=params_pairs, body_example=body_example, tag_name=tag_name, admin=admin,
                base_var=base_var,
            )
            (out_dir / 'smoke.js').write_text(smoke)
            (out_dir / 'stress.js').write_text(stress)
            count += 1

    print(f'Generated {count} endpoint test pairs (smoke + stress).')
    if skipped:
        print(f'Skipped: {len(skipped)}')
        for s in skipped:
            print(' ', s)
    return 0


if __name__ == '__main__':
    sys.exit(main())
