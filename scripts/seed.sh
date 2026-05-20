#!/usr/bin/env bash
# One-file bash seeder cho DocFlow — đọc từ /data và gọi API tạo dữ liệu thật.
#
# Thứ tự:
#   1) Login admin → lấy access_token + csrf_token
#   2) POST /v1/departments              ← data/seed/departments.json
#   3) POST /v1/users/import             ← data/users-import.csv
#   4) POST /v1/templates                ← data/seed/templates.json
#   5) POST /v1/rules                    ← data/seed/rules.json
#   6) POST /v1/dossiers + PUT graph     ← data/seed/dossiers.json
#
# Yêu cầu: bash, curl, jq
#
# Usage:
#   ./scripts/seed.sh
#   BASE_URL=http://staging:29002/api ADMIN_USERNAME=admin ADMIN_PASSWORD=secret ./scripts/seed.sh
#
# Flags:
#   --depts-only      chỉ tạo phòng ban
#   --users-only      chỉ import user
#   --templates-only  chỉ tạo template (cần department-ids.json đã có)
#   --rules-only      chỉ tạo rule (cần department-ids.json đã có)
#   --dossiers-only   chỉ tạo dossier + graph (cần templates + rules đã có)
#   --preview-users   chỉ preview CSV import, không tạo thật

set -euo pipefail

# ── config ────────────────────────────────────────────────────────────────────
BASE_URL="${BASE_URL:-http://localhost:29002/api}"
BASE_URL_V2="${BASE_URL_V2:-$BASE_URL}"   # v2 endpoints (dossier graph) — set khác khi v2 trên port riêng
ADMIN_USERNAME="${ADMIN_USERNAME:-admin}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin123}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATA_DIR="$ROOT/data"
SEED_DIR="$DATA_DIR/seed"
DEPT_IDS_FILE="$SEED_DIR/department-ids.json"

MODE="all"
for arg in "$@"; do
  case "$arg" in
    --depts-only)    MODE="depts" ;;
    --users-only)    MODE="users" ;;
    --templates-only) MODE="templates" ;;
    --rules-only)    MODE="rules" ;;
    --dossiers-only) MODE="dossiers" ;;
    --preview-users) MODE="preview-users" ;;
    -h|--help) sed -n '2,22p' "$0"; exit 0 ;;
    *) echo "unknown flag: $arg"; exit 1 ;;
  esac
done

# ── deps check ────────────────────────────────────────────────────────────────
for cmd in curl jq; do
  command -v "$cmd" >/dev/null || { echo "✗ missing dep: $cmd"; exit 1; }
done

# ── logging helpers ──────────────────────────────────────────────────────────
section() { printf '\n════════════════════════════════════════════════════════════\n▶ %s\n════════════════════════════════════════════════════════════\n' "$1"; }
ok()      { printf '  ✓ %s\n' "$1"; }
fail()    { printf '  ✗ %s\n' "$1" >&2; }

# ── login → ACCESS_TOKEN, CSRF_TOKEN ─────────────────────────────────────────
ACCESS_TOKEN=""
REFRESH_TOKEN=""
CSRF_TOKEN=""

login() {
  section "Login admin"
  local body
  body=$(jq -nc --arg u "$ADMIN_USERNAME" --arg p "$ADMIN_PASSWORD" \
         '{username:$u, password:$p}')

  local res
  res=$(curl -sS -w '\n%{http_code}' -X POST "$BASE_URL/v1/auth/login" \
        -H 'Content-Type: application/json' -d "$body")
  local status=${res##*$'\n'}
  local payload=${res%$'\n'*}

  if [[ "$status" != "200" ]]; then
    fail "login failed (HTTP $status): $payload"; exit 1
  fi

  ACCESS_TOKEN=$(jq -r '.access_token // empty' <<<"$payload")
  REFRESH_TOKEN=$(jq -r '.refresh_token // empty' <<<"$payload")
  [[ -z "$ACCESS_TOKEN" ]] && { fail "no access_token in response"; exit 1; }
  ok "got access_token"

  # CSRF
  local csrf_cookies="docai_access_token=$ACCESS_TOKEN"
  [[ -n "$REFRESH_TOKEN" ]] && csrf_cookies+="; docai_refresh_token=$REFRESH_TOKEN"
  CSRF_TOKEN=$(curl -sS -D - -o /dev/null "$BASE_URL/v1/auth/csrf" \
               -H "Cookie: $csrf_cookies" \
               | awk -F'[=;]' '/[Ss]et-[Cc]ookie:.*docai_csrf_token/ {print $2}' | tr -d '\r' | head -1)
  [[ -n "$CSRF_TOKEN" ]] && ok "got csrf_token" || ok "no csrf token (server may not require)"
}

# Build common headers for authenticated requests
auth_headers=(
  -H "Authorization: Bearer __TOKEN__"
)
build_headers() {
  auth_headers=(
    -H "Authorization: Bearer $ACCESS_TOKEN"
    -H "Cookie: docai_access_token=$ACCESS_TOKEN; docai_refresh_token=$REFRESH_TOKEN; docai_csrf_token=$CSRF_TOKEN"
  )
  [[ -n "$CSRF_TOKEN" ]] && auth_headers+=( -H "X-CSRF-Token: $CSRF_TOKEN" )
}

# ── 1) departments ────────────────────────────────────────────────────────────
seed_departments() {
  section "Departments (data/seed/departments.json)"
  local input="$SEED_DIR/departments.json"
  [[ -f "$input" ]] || { fail "missing $input"; exit 1; }

  # Map sẵn name → existing id để tránh tạo trùng
  local existing
  existing=$(curl -sS "${auth_headers[@]}" "$BASE_URL/v1/departments?page=1&size=100" \
             | jq -r '(.items // []) | map({(.name): .id}) | add // {}')

  : > "$DEPT_IDS_FILE.tmp"
  echo '{' > "$DEPT_IDS_FILE.tmp"
  local first=1

  local count
  count=$(jq 'length' "$input")
  for i in $(seq 0 $((count - 1))); do
    local code name desc dept_id
    code=$(jq -r ".[$i].code"        "$input")
    name=$(jq -r ".[$i].name"        "$input")
    desc=$(jq -r ".[$i].description" "$input")

    dept_id=$(jq -r --arg n "$name" '.[$n] // empty' <<<"$existing")
    if [[ -n "$dept_id" ]]; then
      ok "$name đã tồn tại (id=$dept_id) — bỏ qua"
    else
      local payload status res
      payload=$(jq -nc --arg n "$name" --arg d "$desc" '{name:$n, description:$d}')
      res=$(curl -sS -w '\n%{http_code}' -X POST "$BASE_URL/v1/departments" \
            "${auth_headers[@]}" -H 'Content-Type: application/json' -d "$payload")
      status=${res##*$'\n'}; res=${res%$'\n'*}
      if [[ "$status" =~ ^2 ]]; then
        dept_id=$(jq -r '.id // .data.id // empty' <<<"$res")
        ok "$name → id=$dept_id"
      else
        fail "$name → HTTP $status: ${res:0:200}"
        continue
      fi
    fi

    [[ $first -eq 1 ]] || echo ',' >> "$DEPT_IDS_FILE.tmp"
    first=0
    printf '  "%s": %s' "$code" "${dept_id:-null}" >> "$DEPT_IDS_FILE.tmp"
  done
  echo; echo '}' >> "$DEPT_IDS_FILE.tmp"
  mv "$DEPT_IDS_FILE.tmp" "$DEPT_IDS_FILE"
  ok "saved $DEPT_IDS_FILE"
}

# ── 2) users (CSV import) ────────────────────────────────────────────────────
seed_users() {
  local preview_only="${1:-0}"
  section "Users (data/users-import.csv)"
  local input="$DATA_DIR/users-import.csv"
  [[ -f "$input" ]] || { fail "missing $input"; exit 1; }

  if [[ "$preview_only" == "1" ]]; then
    local endpoint="/v1/users/import/preview"
    local label="PREVIEW"
  else
    # Preview trước
    seed_users 1
    local endpoint="/v1/users/import"
    local label="IMPORT"
  fi

  echo
  ok "$label $input → $endpoint"
  local res status
  res=$(curl -sS -w '\n%{http_code}' -X POST "$BASE_URL$endpoint" \
        "${auth_headers[@]}" -F "file=@$input;type=text/csv")
  status=${res##*$'\n'}; res=${res%$'\n'*}

  if [[ "$status" =~ ^2 ]]; then
    ok "HTTP $status"
    jq '.' <<<"$res" 2>/dev/null | head -40 || echo "${res:0:1000}"
  else
    fail "HTTP $status: ${res:0:500}"
    exit 1
  fi
}

# ── 3) templates ─────────────────────────────────────────────────────────────
seed_templates() {
  section "Templates (data/seed/templates.json)"
  local input="$SEED_DIR/templates.json"
  [[ -f "$input" ]] || { fail "missing $input"; exit 1; }
  [[ -f "$DEPT_IDS_FILE" ]] || { fail "missing $DEPT_IDS_FILE — chạy --depts-only trước"; exit 1; }

  local ok_n=0 fail_n=0
  local count
  count=$(jq 'length' "$input")
  for i in $(seq 0 $((count - 1))); do
    local name code payload res status
    name=$(jq -r ".[$i].name"            "$input")
    code=$(jq -r ".[$i].department_code" "$input")
    local dept_id
    dept_id=$(jq -r --arg c "$code" '.[$c] // empty' "$DEPT_IDS_FILE")

    # Build payload từ entry, gắn department_id, drop department_code
    payload=$(jq -c --argjson did "${dept_id:-null}" --argjson idx "$i" \
              '.[$idx] | {name, description, tags, department_id: $did, fields}' \
              "$input")

    res=$(curl -sS -w '\n%{http_code}' -X POST "$BASE_URL/v1/templates" \
          "${auth_headers[@]}" -H 'Content-Type: application/json' -d "$payload")
    status=${res##*$'\n'}; res=${res%$'\n'*}

    if [[ "$status" =~ ^2 ]]; then
      local id; id=$(jq -r '.id // .data.id // empty' <<<"$res")
      ok "[$code] $name → id=$id"
      ((ok_n++))
    else
      fail "[$code] $name → HTTP $status: ${res:0:200}"
      ((fail_n++))
    fi
  done
  echo; ok "templates: $ok_n ok, $fail_n fail"
}

# ── 4) rules ─────────────────────────────────────────────────────────────────
seed_rules() {
  section "Rules (data/seed/rules.json)"
  local input="$SEED_DIR/rules.json"
  [[ -f "$input" ]] || { fail "missing $input"; exit 1; }
  [[ -f "$DEPT_IDS_FILE" ]] || { fail "missing $DEPT_IDS_FILE — chạy --depts-only trước"; exit 1; }

  local ok_n=0 fail_n=0
  local count
  count=$(jq 'length' "$input")
  for i in $(seq 0 $((count - 1))); do
    local name code payload res status
    name=$(jq -r ".[$i].name"            "$input")
    code=$(jq -r ".[$i].department_code" "$input")
    local dept_id
    dept_id=$(jq -r --arg c "$code" '.[$c] // empty' "$DEPT_IDS_FILE")

    payload=$(jq -c --argjson did "${dept_id:-null}" --argjson idx "$i" \
              '.[$idx] | {name, description, tags, condition, rule_type, severity, department_id: $did}' \
              "$input")

    res=$(curl -sS -w '\n%{http_code}' -X POST "$BASE_URL/v1/rules" \
          "${auth_headers[@]}" -H 'Content-Type: application/json' -d "$payload")
    status=${res##*$'\n'}; res=${res%$'\n'*}

    if [[ "$status" =~ ^2 ]]; then
      local id; id=$(jq -r '.id // .data.id // empty' <<<"$res")
      ok "[$code] $name → id=$id"
      ((ok_n++))
    else
      fail "[$code] $name → HTTP $status: ${res:0:200}"
      ((fail_n++))
    fi
  done
  echo; ok "rules: $ok_n ok, $fail_n fail"
}

# ── 5) dossiers + graph ──────────────────────────────────────────────────────
#
# Bước này phụ thuộc templates + rules đã có trên server.
# Mỗi dossier:
#   1. Resolve template_names → template_ids và rule_names → rule_ids
#   2. POST /v1/dossiers (tạo dossier, body có template_ids+rule_ids — backup, server có thể bỏ qua)
#   3. POST /v1/dossiers/{id}/templates?template_id=X cho mỗi template (explicit link)
#   4. POST /v1/dossiers/{id}/rules?rule_id=X cho mỗi rule (explicit link, admin bypass approval)
#   5. POST /v2/dossiers/{id}/rules/link với scope_mapping từ edges (rule→[template_ids])
#   6. PUT  /v2/dossiers/{id}/graph
seed_dossiers() {
  section "Dossiers (data/seed/dossiers.json)"
  local input="$SEED_DIR/dossiers.json"
  [[ -f "$input" ]] || { fail "missing $input"; exit 1; }
  [[ -f "$DEPT_IDS_FILE" ]] || { fail "missing $DEPT_IDS_FILE — chạy --depts-only trước"; exit 1; }

  # Pre-fetch name → id maps cho templates & rules
  ok "fetching template & rule name→id maps..."
  local tpl_list rule_list
  tpl_list=$(curl -sS "${auth_headers[@]}" "$BASE_URL/v1/templates?size=100")
  rule_list=$(curl -sS "${auth_headers[@]}" "$BASE_URL/v1/rules?size=100")

  local tpl_map rule_map
  tpl_map=$(jq  -c '(.items // .data // []) | map({(.name): .id}) | add // {}' <<<"$tpl_list")
  rule_map=$(jq -c '(.items // .data // []) | map({(.name): .id}) | add // {}' <<<"$rule_list")
  ok "tpl_map: $(jq 'length' <<<"$tpl_map") entries, rule_map: $(jq 'length' <<<"$rule_map") entries"

  local count ok_n=0 fail_n=0
  count=$(jq 'length' "$input")
  for i in $(seq 0 $((count - 1))); do
    local dossier name desc tags dept_code dept_id
    dossier=$(jq -c ".[$i]" "$input")
    name=$(jq -r '.name'         <<<"$dossier")
    desc=$(jq -r '.description'  <<<"$dossier")
    tags=$(jq -c '.tags // []'   <<<"$dossier")
    dept_code=$(jq -r '.department_code // empty' <<<"$dossier")
    dept_id=$(jq -r --arg c "$dept_code" '.[$c] // "null"' "$DEPT_IDS_FILE")

    # Map template/rule names → ids (drop những cái không tìm thấy)
    local tpl_ids rule_ids
    tpl_ids=$(jq -c --argjson m "$tpl_map" \
              '.templates | map($m[.] // null) | map(select(. != null))' <<<"$dossier")
    rule_ids=$(jq -c --argjson m "$rule_map" \
               '.rules | map($m[.] // null) | map(select(. != null))' <<<"$dossier")

    local t_count r_count
    t_count=$(jq 'length' <<<"$tpl_ids")
    r_count=$(jq 'length' <<<"$rule_ids")
    if [[ "$t_count" == "0" && "$r_count" == "0" ]]; then
      fail "$name: không resolve được template/rule nào → skip"
      ((fail_n++))
      continue
    fi

    # 1) POST dossier
    local payload res status dossier_id
    payload=$(jq -nc \
      --arg name "$name" --arg desc "$desc" \
      --argjson tags "$tags" --argjson did "$dept_id" \
      --argjson tids "$tpl_ids" --argjson rids "$rule_ids" \
      '{
        name: $name, description: $desc, tags: $tags,
        status: "draft", visibility: "private",
        department_id: (if $did == "null" then null else ($did|tonumber) end),
        template_ids: $tids, rule_ids: $rids
      }')

    res=$(curl -sS -w '\n%{http_code}' -X POST "$BASE_URL/v1/dossiers" \
          "${auth_headers[@]}" -H 'Content-Type: application/json' -d "$payload")
    status=${res##*$'\n'}; res=${res%$'\n'*}

    if [[ ! "$status" =~ ^2 ]]; then
      fail "$name → POST HTTP $status: ${res:0:200}"
      ((fail_n++))
      continue
    fi
    dossier_id=$(jq -r '.id // .data.id // empty' <<<"$res")
    ok "[$dept_code] $name → dossier_id=$dossier_id"

    # 2) Link templates explicit qua POST /v1/dossiers/{id}/templates?template_id=X
    local t_link_ok=0
    for tid in $(jq -r '.[]' <<<"$tpl_ids"); do
      local tr
      tr=$(curl -sS -o /dev/null -w '%{http_code}' -X POST \
        "$BASE_URL/v1/dossiers/$dossier_id/templates?template_id=$tid" \
        "${auth_headers[@]}")
      [[ "$tr" =~ ^2 ]] && ((t_link_ok++))
    done
    ok "  ├─ templates linked: $t_link_ok/$t_count"

    # 3) Link rules explicit qua POST /v1/dossiers/{id}/rules?rule_id=X
    #    (admin bypass yêu cầu rule phải approved)
    local r_link_ok=0
    for rid in $(jq -r '.[]' <<<"$rule_ids"); do
      local rr
      rr=$(curl -sS -o /dev/null -w '%{http_code}' -X POST \
        "$BASE_URL/v1/dossiers/$dossier_id/rules?rule_id=$rid" \
        "${auth_headers[@]}")
      [[ "$rr" =~ ^2 ]] && ((r_link_ok++))
    done
    ok "  ├─ rules linked: $r_link_ok/$r_count"

    # 4) Scope mapping: từ edges trong dossiers.json, tính rule → [template_ids]
    #    Edge [a,b]: a,b là index trong [tpl..., rule...] (concat). Pair tpl-rule mới count.
    local rule_scopes
    rule_scopes=$(jq -c --argjson tids "$tpl_ids" --argjson rids "$rule_ids" \
      '
      ($tids | length) as $tn |
      (.edges // [])
      | map(
          if   (.[0] < $tn) and (.[1] >= $tn) then { rule_idx: (.[1] - $tn), tpl_id: $tids[.[0]] }
          elif (.[0] >= $tn) and (.[1] < $tn) then { rule_idx: (.[0] - $tn), tpl_id: $tids[.[1]] }
          else null end
        )
      | map(select(. != null))
      | group_by(.rule_idx)
      | map({ rule_id: $rids[.[0].rule_idx], target_template_ids: (map(.tpl_id) | unique) })
      ' <<<"$dossier")

    local scope_ok=0 scope_count
    scope_count=$(jq 'length' <<<"$rule_scopes")
    for j in $(seq 0 $((scope_count - 1))); do
      local link_body lr
      link_body=$(jq -c ".[$j]" <<<"$rule_scopes")
      lr=$(curl -sS -o /dev/null -w '%{http_code}' -X POST \
        "$BASE_URL_V2/v2/dossiers/$dossier_id/rules/link" \
        "${auth_headers[@]}" -H 'Content-Type: application/json' -d "$link_body")
      [[ "$lr" =~ ^2 ]] && ((scope_ok++))
    done
    ok "  ├─ scope_mapping: $scope_ok/$scope_count"

    # 5) Build graph_data — layout 2 cột: templates trái, rules phải
    local edges_def graph
    edges_def=$(jq -c '.edges // []' <<<"$dossier")

    graph=$(jq -nc \
      --argjson tids "$tpl_ids" --argjson rids "$rule_ids" \
      --argjson edges "$edges_def" \
      '
      def node_id($k; $kind): "dn_\($kind)_\($k)";
      {
        nodes: (
          ($tids | to_entries | map({
            id: node_id(.key; "t"),
            type: "templateNode",
            position: { x: 300, y: (100 + (.key * 150)) },
            data: {
              id: .value, type: "templateNode",
              label: ("Template " + (.value | tostring))
            },
            width: 240, height: 120
          }))
          +
          ($rids | to_entries | map({
            id: node_id(.key; "r"),
            type: "ruleNode",
            position: { x: 720, y: (100 + (.key * 150)) },
            data: {
              id: .value, type: "ruleNode",
              label: ("Rule " + (.value | tostring))
            },
            width: 200, height: 60
          }))
        ),
        edges: (
          $edges | to_entries | map(
            . as $e |
            ($e.value[0]) as $a | ($e.value[1]) as $b |
            ($tids | length) as $tn |
            ($a < $tn) as $a_is_t | ($b < $tn) as $b_is_t |
            {
              id: ("e_" + ($e.key | tostring)),
              source: (if $a_is_t then "dn_t_\($a)"   else "dn_r_\($a - $tn)" end),
              target: (if $b_is_t then "dn_t_\($b)"   else "dn_r_\($b - $tn)" end),
              sourceHandle: null, targetHandle: null,
              type: "default", animated: true,
              style: { strokeWidth: 2, stroke: "#64748b" }
            }
          )
        ),
        settings: {}
      }')

    # 6) PUT graph — graph_data là JSON STRING (stringified)
    local graph_payload graph_res graph_status
    graph_payload=$(jq -nc --argjson g "$graph" '{ graph_data: ($g | tostring) }')

    graph_res=$(curl -sS -w '\n%{http_code}' -X PUT \
                "$BASE_URL_V2/v2/dossiers/$dossier_id/graph" \
                "${auth_headers[@]}" -H 'Content-Type: application/json' \
                -d "$graph_payload")
    graph_status=${graph_res##*$'\n'}; graph_res=${graph_res%$'\n'*}

    if [[ "$graph_status" =~ ^2 ]]; then
      ok "  └─ graph → $(jq 'length' <<<"$tpl_ids") templateNode + $(jq 'length' <<<"$rule_ids") ruleNode + $(jq 'length' <<<"$edges_def") edges"
      ((ok_n++))
    else
      fail "  └─ graph PUT HTTP $graph_status: ${graph_res:0:200}"
      ((fail_n++))
    fi
  done
  echo; ok "dossiers: $ok_n ok, $fail_n fail"
}

# ── run ──────────────────────────────────────────────────────────────────────
login
build_headers

case "$MODE" in
  all)
    seed_departments
    seed_users
    seed_templates
    seed_rules
    seed_dossiers
    ;;
  depts)         seed_departments ;;
  users)         seed_users ;;
  preview-users) seed_users 1 ;;
  templates)     seed_templates ;;
  rules)         seed_rules ;;
  dossiers)      seed_dossiers ;;
esac

echo
ok "Done."
