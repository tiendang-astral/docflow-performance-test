#!/usr/bin/env bash
# Chạy smoke test cho tất cả endpoints và luồng tuần tự.
# Usage:
#   ./scripts/smoke-all.sh
#   BASE_URL=http://staging:29002/api ./scripts/smoke-all.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

ENDPOINTS=(
  admin
  ai
  api-keys
  assessment
  auth
  departments
  designer
  dossier-export
  dossiers
  extraction
  form-templates
  pipeline
  platform-v3
  rules
  tags
  templates
  users
)

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

run_smoke() {
  local label="$1"
  local test_file="$2"

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "▶  Smoke: $label"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  local k6_args=(run)
  [[ -n "${BASE_URL:-}" ]] && k6_args+=(-e "BASE_URL=$BASE_URL")
  k6_args+=("$test_file")

  if k6 "${k6_args[@]}"; then
    PASSED+=("$label")
  else
    FAILED+=("$label")
    echo "✗  $label FAILED" >&2
  fi
}

echo "════════════════════════════════════════════════"
echo "  ENDPOINTS SMOKE TESTS"
echo "════════════════════════════════════════════════"

for ep in "${ENDPOINTS[@]}"; do
  run_smoke "endpoint/$ep" "$ROOT/tests/endpoints/$ep/smoke.js"
done

echo ""
echo "════════════════════════════════════════════════"
echo "  LUỒNG SMOKE TESTS"
echo "════════════════════════════════════════════════"

for flow in "${FLOWS[@]}"; do
  run_smoke "$flow" "$ROOT/tests/$flow/smoke.js"
done

echo ""
echo "════════════════════════════════════════════════"
echo "  KẾT QUẢ SMOKE TEST"
echo "════════════════════════════════════════════════"
printf "  PASSED (%d): %s\n" "${#PASSED[@]}" "${PASSED[*]:-none}"
printf "  FAILED (%d): %s\n" "${#FAILED[@]}" "${FAILED[*]:-none}"
echo "════════════════════════════════════════════════"

[[ ${#FAILED[@]} -eq 0 ]]
