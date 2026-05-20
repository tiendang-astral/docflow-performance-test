#!/usr/bin/env bash
#
# Chạy toàn bộ stress test cho từng mức VU: 50, 100, 150, 200, 250, 300.
# Mỗi endpoint × mỗi mức VU → 1 lần k6 run riêng (constant VU, ramp 20s → hold 1m → ramp 20s).
#
# Usage:
#   bash scripts/run-stress-all.sh
#   bash scripts/run-stress-all.sh 100 200            # chỉ chạy 2 mức VU đó
#   BASE_URL=http://staging:29002/api bash scripts/run-stress-all.sh
#   TEST_GROUPS="identity dossier/v2 auth" bash scripts/run-stress-all.sh
#     - category:   identity     → tests/identity/**
#     - group:      auth         → tests/*/auth/**
#     - cat/group:  dossier/v2   → tests/dossier/v2/**
#
# Kết quả lưu ở results/<group>-<endpoint>-stress-<vu>vu-<timestamp>.{html,json}

set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

mkdir -p results

VU_LEVELS=("$@")
if (( ${#VU_LEVELS[@]} == 0 )); then
  VU_LEVELS=(50 100 150 200 250 300)
fi

resolve_target() {
  local t="${1%/}"
  if [[ -d "tests/$t" ]]; then
    find "tests/$t" -name stress.js -type f 2>/dev/null
    return
  fi
  if [[ "$t" != */* ]]; then
    find tests -mindepth 2 -maxdepth 2 -type d -name "$t" 2>/dev/null \
      | while IFS= read -r d; do find "$d" -name stress.js -type f; done
  fi
}

collect_files() {
  if [[ -n "${TEST_GROUPS:-}" ]]; then
    for g in $TEST_GROUPS; do
      resolve_target "$g"
    done
  else
    find tests -name stress.js -type f
  fi
}

files=()
while IFS= read -r line; do
  files+=("$line")
done < <(collect_files | sort)
total=${#files[@]}
if (( total == 0 )); then
  echo "No stress.js files found under tests/" >&2
  exit 1
fi

echo "Running $total stress tests × ${#VU_LEVELS[@]} VU levels (${VU_LEVELS[*]})"
echo "BASE_URL=${BASE_URL:-http://localhost:29002/api}"
echo

pass=0
fail=0
total_runs=$((total * ${#VU_LEVELS[@]}))
i=0
for vu in "${VU_LEVELS[@]}"; do
  echo "=== VU=$vu ==="
  for f in "${files[@]}"; do
    i=$((i+1))
    printf '[%4d/%4d] vu=%d %s ... ' "$i" "$total_runs" "$vu" "$f"
    if MAX_VU="$vu" k6 run --quiet -e MAX_VU="$vu" "$f" >/dev/null 2>&1; then
      echo "OK"
      pass=$((pass+1))
    else
      echo "FAIL"
      fail=$((fail+1))
    fi
  done
  echo
done

echo "Summary: $pass passed, $fail failed (of $total_runs runs)"
[[ $fail -eq 0 ]]
