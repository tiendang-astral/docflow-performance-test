#!/usr/bin/env bash
# One-file bash seeder cho DocFlow — đọc từ /data và gọi API tạo dữ liệu thật.
#
# Thứ tự:
#   1) Login admin → lấy access_token + csrf_token
#   2) POST /v1/departments     ← data/seed/departments.json
#   3) POST /v1/users/import    ← data/users-import.csv
#   4) POST /v1/form-templates  ← data/seed/forms.json
#   5) POST /v1/rules           ← data/seed/rules.json
#
# Yêu cầu: bash, curl, jq
#
# Usage:
#   ./scripts/seed.sh
#   BASE_URL=http://staging:29002/api ADMIN_USERNAME=admin ADMIN_PASSWORD=secret ./scripts/seed.sh
#
# Flags:
#   --depts-only    chỉ tạo phòng ban
#   --users-only    chỉ import user
#   --forms-only    chỉ tạo form (cần department-ids.json đã có)
#   --rules-only    chỉ tạo rule (cần department-ids.json đã có)
#   --preview-users chỉ preview CSV import, không tạo thật

set -euo pipefail

# ── config ────────────────────────────────────────────────────────────────────
BASE_URL="${BASE_URL:-http://localhost:29002/api}"
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
    --forms-only)    MODE="forms" ;;
    --rules-only)    MODE="rules" ;;
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

# ── 3) forms ─────────────────────────────────────────────────────────────────
seed_forms() {
  section "Forms (data/seed/forms.json)"
  local input="$SEED_DIR/forms.json"
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

    res=$(curl -sS -w '\n%{http_code}' -X POST "$BASE_URL/v1/form-templates" \
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
  echo; ok "forms: $ok_n ok, $fail_n fail"
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

# ── run ──────────────────────────────────────────────────────────────────────
login
build_headers

case "$MODE" in
  all)
    seed_departments
    seed_users
    seed_forms
    seed_rules
    ;;
  depts)         seed_departments ;;
  users)         seed_users ;;
  preview-users) seed_users 1 ;;
  forms)         seed_forms ;;
  rules)         seed_rules ;;
esac

echo
ok "Done."
