#!/usr/bin/env bash
# Chạy stress test toàn bộ luồng với các mức VU: 50 100 150 200 250 300.
# Report HTML → results-stress-test/
#
# Usage:
#   ./scripts/stress-all.sh
#   BASE_URL=http://staging:29002/api ./scripts/stress-all.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

FLOWS=(luong-07 luong-08)
VUS=(50 100 150 200 250 300)

export RESULTS_DIR="results-stress-test-all"

PASSED=()
FAILED=()

run_one() {
  local target="$1"
  local vu="$2"
  local label="$target @ ${vu}VU"

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "▶  $label"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  if "$ROOT/scripts/stress-test.sh" "$target" --vu "$vu"; then
    PASSED+=("$label")
  else
    FAILED+=("$label")
    echo "✗  FAILED: $label" >&2
  fi
}

echo "════════════════════════════════════════════════"
echo "  VUs: ${VUS[*]}"
echo "  report → $RESULTS_DIR/"
echo "════════════════════════════════════════════════"

echo "══ LUỒNG ══════════════════════════════════════"
for flow in "${FLOWS[@]}"; do
  for vu in "${VUS[@]}"; do
    run_one "$flow" "$vu"
  done
done

echo ""
echo "════════════════════════════════════════════════"
printf "  PASSED (%d)\n" "${#PASSED[@]}"
printf "  FAILED (%d): %s\n" "${#FAILED[@]}" "${FAILED[*]:-—}"
echo "════════════════════════════════════════════════"

[[ ${#FAILED[@]} -eq 0 ]]
