#!/usr/bin/env bash
# Chạy k6 test và push metric thời gian thực vào Prometheus.
# Mỗi run tự động gắn label target= và test_type= để lọc trên Grafana.
#
# Yêu cầu: Prometheus phải bật --enable-feature=remote-write-receiver
#
# Usage:
#   ./scripts/k6-prom.sh                               # smoke + load + stress100..300 + spike → results/
#   ./scripts/k6-prom.sh --smoke                       # chỉ smoke → results/
#   ./scripts/k6-prom.sh --stress100 --stress200       # chỉ 2 mức stress → results/
#   TARGET=luong-01 TYPE=stress100 ./scripts/k6-prom.sh  # → results/luong-01/
#   TARGET=rules    TYPE=stress200 ./scripts/k6-prom.sh  # → results/rules/
#   BASE_URL=http://staging:29002/api ./scripts/k6-prom.sh
#   PROMETHEUS_URL=http://other:9090 ./scripts/k6-prom.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

PROM_BASE="${PROMETHEUS_URL:-http://localhost:29111}"
PROM_RW_URL="${PROM_BASE}/api/v1/write"

ENDPOINTS=(
  admin api-keys departments designer dossier-export
  dossiers form-templates platform-v3 rules tags templates users
)
FLOWS=(luong-01 luong-02 luong-03 luong-04 luong-05 luong-06 luong-07 luong-08)

# Parse --smoke / --load / --stress / --stress100..300 / --spike flags
TYPES=()
for arg in "$@"; do
  case "$arg" in
    --smoke)     TYPES+=(smoke)     ;;
    --load)      TYPES+=(load)      ;;
    --stress)    TYPES+=(stress)    ;;
    --stress100) TYPES+=(stress100) ;;
    --stress150) TYPES+=(stress150) ;;
    --stress200) TYPES+=(stress200) ;;
    --stress250) TYPES+=(stress250) ;;
    --stress300) TYPES+=(stress300) ;;
    --spike)     TYPES+=(spike)     ;;
  esac
done
[[ ${#TYPES[@]} -eq 0 ]] && TYPES=(smoke load stress100 stress150 stress200 stress250 stress300 spike)

PASSED=()
FAILED=()

run_test() {
  local target="$1"
  local ttype="$2"
  local file="$3"
  local label="$target/$ttype"

  if [[ ! -f "$file" ]]; then
    echo "[SKIP] $label — file not found: $file"
    return
  fi

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "▶  target=$target  type=$ttype"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  local results_dir="${RESULTS_DIR:-results/$target}"

  local extra=()
  [[ -n "${BASE_URL:-}" ]] && extra+=(-e "BASE_URL=$BASE_URL")
  extra+=(-e "RESULTS_DIR=$results_dir")

  if K6_PROMETHEUS_RW_SERVER_URL="$PROM_RW_URL" \
     K6_PROMETHEUS_RW_TREND_STATS="avg,med,min,max,p(90),p(95),p(99)" \
     K6_PROMETHEUS_RW_PUSH_INTERVAL="3s" \
     K6_PROMETHEUS_RW_STALE_MARKERS="true" \
     k6 run \
       --out experimental-prometheus-rw \
       --tag "target=$target" \
       --tag "test_type=$ttype" \
       ${extra[@]+"${extra[@]}"} \
       "$file"; then
    PASSED+=("$label")
  else
    FAILED+=("$label")
    echo "✗  FAILED: $label" >&2
  fi
}

# Chế độ chạy đơn lẻ: TARGET=admin TYPE=smoke ./k6-prom.sh
if [[ -n "${TARGET:-}" && -n "${TYPE:-}" ]]; then
  if [[ "$TARGET" == luong-* ]]; then
    run_test "$TARGET" "$TYPE" "$ROOT/tests/$TARGET/$TYPE.js"
  else
    run_test "$TARGET" "$TYPE" "$ROOT/tests/endpoints/$TARGET/$TYPE.js"
  fi
  exit $([[ "${#FAILED[@]}" -eq 0 ]] && echo 0 || echo 1)
fi

echo "════════════════════════════════════════════════"
echo "  Prometheus → $PROM_RW_URL"
echo "  Test types:  ${TYPES[*]}"
echo "════════════════════════════════════════════════"

echo ""
echo "══ ENDPOINTS ══════════════════════════════════"
for ep in "${ENDPOINTS[@]}"; do
  for t in "${TYPES[@]}"; do
    run_test "$ep" "$t" "$ROOT/tests/endpoints/$ep/$t.js"
  done
done

echo ""
echo "══ LUỒNG ══════════════════════════════════════"
for flow in "${FLOWS[@]}"; do
  for t in "${TYPES[@]}"; do
    run_test "$flow" "$t" "$ROOT/tests/$flow/$t.js"
  done
done

echo ""
echo "════════════════════════════════════════════════"
printf "  PASSED (%d)\n" "${#PASSED[@]}"
printf "  FAILED (%d): %s\n" "${#FAILED[@]}" "${FAILED[*]:-—}"
echo "════════════════════════════════════════════════"

[[ ${#FAILED[@]} -eq 0 ]]
