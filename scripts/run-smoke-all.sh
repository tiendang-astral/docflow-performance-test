#!/usr/bin/env bash
#
# Chạy toàn bộ smoke test (mỗi endpoint một file).
#
# Layout: tests/<category>/<group>/<endpoint>/smoke.js
#
# Usage:
#   bash scripts/run-smoke-all.sh
#   BASE_URL=http://staging:29002/api bash scripts/run-smoke-all.sh
#   TEST_GROUPS="identity auth dossier/v2" bash scripts/run-smoke-all.sh
#     - category:       identity     → tests/identity/**
#     - group:          auth         → tests/*/auth/**
#     - cat/group:      dossier/v2   → tests/dossier/v2/**
#
# Kết quả lưu ở results/<group>-<endpoint>-smoke-<timestamp>.{html,json}

set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

mkdir -p results

# Resolve 1 target (category | group | cat/group) → liệt kê smoke.js files.
resolve_target() {
  local t="${1%/}"
  if [[ -d "tests/$t" ]]; then
    find "tests/$t" -name smoke.js -type f 2>/dev/null
    return
  fi
  # bare 'auth' → tests/*/auth/
  if [[ "$t" != */* ]]; then
    find tests -mindepth 2 -maxdepth 2 -type d -name "$t" 2>/dev/null \
      | while IFS= read -r d; do find "$d" -name smoke.js -type f; done
  fi
}

# Liệt kê smoke files (nếu set TEST_GROUPS thì lọc).
collect_files() {
  if [[ -n "${TEST_GROUPS:-}" ]]; then
    for g in $TEST_GROUPS; do
      resolve_target "$g"
    done
  else
    find tests -name smoke.js -type f
  fi
}

files=()
while IFS= read -r line; do
  files+=("$line")
done < <(collect_files | sort)
total=${#files[@]}
if (( total == 0 )); then
  echo "No smoke.js files found under tests/" >&2
  exit 1
fi

echo "Running $total smoke tests..."
echo "BASE_URL=${BASE_URL:-http://localhost:29002/api}"
echo

pass=0
fail=0
i=0
for f in "${files[@]}"; do
  i=$((i+1))
  printf '[%3d/%3d] %s ... ' "$i" "$total" "$f"
  if k6 run --quiet "$f" >/dev/null 2>&1; then
    echo "OK"
    pass=$((pass+1))
  else
    echo "FAIL"
    fail=$((fail+1))
  fi
done

echo
echo "Summary: $pass passed, $fail failed (of $total)"
[[ $fail -eq 0 ]]
