#!/usr/bin/env bash
# Chạy smoke test cho tất cả các luồng tuần tự.
# Usage:
#   ./scripts/smoke-all.sh
#   BASE_URL=http://staging:29002/api ./scripts/smoke-all.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

FLOWS=(
  luong-01
  luong-02
  luong-03
  luong-04
  luong-05
  luong-06
  luong-07
  luong-08
)

PASSED=()
FAILED=()

for flow in "${FLOWS[@]}"; do
  test_file="$ROOT/tests/$flow/smoke.js"

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "▶  Smoke: $flow"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  k6_args=(run)
  [[ -n "${BASE_URL:-}" ]] && k6_args+=(-e "BASE_URL=$BASE_URL")
  k6_args+=("$test_file")

  if k6 "${k6_args[@]}"; then
    PASSED+=("$flow")
  else
    FAILED+=("$flow")
    echo "✗  $flow FAILED" >&2
  fi
done

echo ""
echo "════════════════════════════════════════════════"
echo "  KẾT QUẢ SMOKE TEST"
echo "════════════════════════════════════════════════"
echo "  PASSED (${#PASSED[@]}): ${PASSED[*]:-none}"
echo "  FAILED (${#FAILED[@]}): ${FAILED[*]:-none}"
echo "════════════════════════════════════════════════"

[[ ${#FAILED[@]} -eq 0 ]]
