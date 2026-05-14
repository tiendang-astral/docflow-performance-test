#!/usr/bin/env bash
# Chạy stress test cho một luồng hoặc endpoint với số VU tuỳ chọn.
# Stage: ramp 20s → hold 1m → ramp down 20s.
# Report HTML → results-stress-test/
#
# Usage:
#   ./scripts/stress-test.sh luong-01 --vu 100
#   ./scripts/stress-test.sh rules    --vu 200
#   BASE_URL=http://staging:29002/api ./scripts/stress-test.sh luong-02 --vu 150

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

TARGET="${1:?Usage: $0 <luong|endpoint> --vu <n>}"
shift

MAX_VU=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --vu) MAX_VU="${2:?--vu cần giá trị số}"; shift 2 ;;
    *) echo "Tham số không hợp lệ: $1" >&2; exit 1 ;;
  esac
done

[[ -z "$MAX_VU" ]] && { echo "Thiếu --vu <n>" >&2; exit 1; }

if [[ "$TARGET" == luong-* ]]; then
  FILE="$ROOT/tests/$TARGET/stress.js"
else
  FILE="$ROOT/tests/endpoints/$TARGET/stress.js"
fi

if [[ ! -f "$FILE" ]]; then
  echo "Không tìm thấy: $FILE" >&2
  exit 1
fi

PROM_BASE="${PROMETHEUS_URL:-http://localhost:29111}"
PROM_RW_URL="${PROM_BASE}/api/v1/write"
RESULTS_DIR="${RESULTS_DIR:-results-stress-test}"

echo "════════════════════════════════════════════════"
echo "  target  : $TARGET"
echo "  max VU  : $MAX_VU"
echo "  stages  : 20s ramp → 1m hold → 20s ramp-down"
echo "  report  → $RESULTS_DIR/"
echo "  prom    → $PROM_RW_URL"
echo "════════════════════════════════════════════════"

extra=()
[[ -n "${BASE_URL:-}" ]] && extra+=(-e "BASE_URL=$BASE_URL")

K6_PROMETHEUS_RW_SERVER_URL="$PROM_RW_URL" \
K6_PROMETHEUS_RW_TREND_STATS="avg,med,min,max,p(90),p(95),p(99)" \
K6_PROMETHEUS_RW_PUSH_INTERVAL="3s" \
K6_PROMETHEUS_RW_STALE_MARKERS="true" \
k6 run \
  --out experimental-prometheus-rw \
  --tag "target=$TARGET" \
  --tag "test_type=stress" \
  -e "MAX_VU=$MAX_VU" \
  -e "RESULTS_DIR=$RESULTS_DIR" \
  ${extra[@]+"${extra[@]}"} \
  "$FILE"
