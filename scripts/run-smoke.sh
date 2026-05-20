#!/usr/bin/env bash
#
# Chạy smoke test theo category / module / endpoint.
#
# Layout: tests/<category>/<group>/<endpoint>/smoke.js
#   category: identity, form-rule, dossier, processing, admin
#   group   : auth, users, departments, templates, v1, v2, v3, monitor, ...
#   endpoint: get-templates, post-login, get-dossier-id-pool, ...
#
# Usage:
#   bash scripts/run-smoke.sh <target> [<target> ...]
#
# Mỗi <target> chấp nhận:
#   - Category:     identity        → chạy mọi smoke trong tests/identity/
#   - Group:        auth            → chạy mọi smoke trong tests/*/auth/
#                   monitor         → chạy mọi smoke trong tests/admin/monitor/
#   - Cat/group:    identity/auth   → chạy mọi smoke trong tests/identity/auth/
#   - Endpoint:     auth/post-login                → chạy 1 smoke
#                   identity/auth/post-login       → chạy 1 smoke
#                   admin/monitor/get-overview     → chạy 1 smoke
#   - File path:    tests/identity/auth/post-login/smoke.js
#
# Ví dụ:
#   bash scripts/run-smoke.sh identity
#   bash scripts/run-smoke.sh dossier/v2
#   bash scripts/run-smoke.sh auth post-login
#   bash scripts/run-smoke.sh admin/monitor/get-overview

set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

usage() {
  echo "Usage: bash scripts/run-smoke.sh <target> [<target> ...]" >&2
  echo "  <target>: category | group | cat/group | cat/group/endpoint | smoke.js path" >&2
  echo >&2
  echo "Categories:" >&2
  find tests -mindepth 1 -maxdepth 1 -type d 2>/dev/null \
    | sed 's|^tests/|  |' | sort >&2
}

if (( $# < 1 )); then
  usage
  exit 1
fi

# Resolve target → list of smoke.js paths (empty = not found).
resolve_target() {
  local t="$1"
  t="${t%/}"
  t="${t#./}"

  # 1. File path trực tiếp
  if [[ "$t" == *.js && -f "$t" ]]; then
    echo "$t"
    return 0
  fi

  # 2. tests/... prefix
  local stripped="${t#tests/}"

  # Endpoint folder: tests/<a>/<b>/<c>/smoke.js
  if [[ -f "tests/$stripped/smoke.js" ]]; then
    echo "tests/$stripped/smoke.js"
    return 0
  fi

  # Folder bất kỳ — find tất cả smoke.js bên dưới
  if [[ -d "tests/$stripped" ]]; then
    find "tests/$stripped" -name smoke.js -type f
    return 0
  fi

  # 3. Không có '/' → coi như group hoặc endpoint thuần (vd "auth", "post-login")
  if [[ "$t" != */* ]]; then
    # Khớp như group: tests/*/<t>/
    local matches
    matches=$(find tests -mindepth 2 -maxdepth 2 -type d -name "$t" 2>/dev/null)
    if [[ -n "$matches" ]]; then
      while IFS= read -r d; do
        find "$d" -name smoke.js -type f
      done <<< "$matches"
      return 0
    fi
    # Khớp như endpoint: tests/*/*/<t>/smoke.js
    matches=$(find tests -mindepth 3 -maxdepth 3 -type d -name "$t" 2>/dev/null)
    if [[ -n "$matches" ]]; then
      while IFS= read -r d; do
        [[ -f "$d/smoke.js" ]] && echo "$d/smoke.js"
      done <<< "$matches"
      return 0
    fi
  fi

  # 4. 2 đoạn 'a/b' — thử coi 'a' là group: tests/*/a/b/smoke.js
  if [[ "$t" == */* && "$t" != */*/* ]]; then
    local g="${t%/*}" e="${t#*/}"
    local matches
    matches=$(find tests -mindepth 3 -maxdepth 3 -type d -path "*/$g/$e" 2>/dev/null)
    if [[ -n "$matches" ]]; then
      while IFS= read -r d; do
        [[ -f "$d/smoke.js" ]] && echo "$d/smoke.js"
      done <<< "$matches"
      return 0
    fi
  fi

  return 1
}

files=()
missing=()
for arg in "$@"; do
  found_any=0
  while IFS= read -r line; do
    if [[ -n "$line" ]]; then
      files+=("$line")
      found_any=1
    fi
  done < <(resolve_target "$arg" 2>/dev/null || true)
  if (( found_any == 0 )); then
    missing+=("$arg")
  fi
done

if (( ${#missing[@]} > 0 )); then
  echo "Không tìm thấy target:" >&2
  for m in "${missing[@]}"; do
    echo "  $m" >&2
  done
  echo >&2
  usage
  exit 1
fi

# Dedupe + sort
if (( ${#files[@]} > 0 )); then
  uniq_files=()
  while IFS= read -r line; do
    uniq_files+=("$line")
  done < <(printf '%s\n' "${files[@]}" | sort -u)
  files=("${uniq_files[@]}")
fi

total=${#files[@]}
if (( total == 0 )); then
  echo "Không có smoke.js nào để chạy." >&2
  exit 1
fi

echo "Running $total smoke test(s)..."
echo "BASE_URL=${BASE_URL:-http://localhost:29002/api}"
echo

i=0
fail=0
for f in "${files[@]}"; do
  i=$((i+1))
  printf '[%3d/%d] %s ... ' "$i" "$total" "$f"
  if k6 run --quiet "$f" > /dev/null 2>&1; then
    echo "OK"
  else
    echo "FAIL"
    fail=$((fail+1))
  fi
done

echo
if (( fail == 0 )); then
  echo "Done. All $total smoke run(s) passed."
else
  echo "Done. $fail / $total smoke run(s) failed."
  exit 1
fi
