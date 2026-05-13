#!/usr/bin/env bash
# Chạy toàn bộ 5 test cho Luồng 02, sinh HTML report tổng hợp.
#
# Usage:
#   bash tests/luong-02/run-all.sh
#   BASE_URL=http://staging:29002/api bash tests/luong-02/run-all.sh
#   bash tests/luong-02/run-all.sh smoke load   # chỉ chạy 1 số test

set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$DIR/../.." && pwd)"
BASE_URL="${BASE_URL:-http://localhost:29002/api}"
QUICK="${QUICK:-true}"
LUONG="luong-02"
TESTS=("smoke" "load" "stress" "spike")

if [[ $# -gt 0 ]]; then
  TESTS=("$@")
fi

# ── Màu ──────────────────────────────────────────────────────────────────────
BOLD='\033[1m'; GREEN='\033[0;32m'; RED='\033[0;31m'
YELLOW='\033[0;33m'; CYAN='\033[0;36m'; RESET='\033[0m'

declare -A RESULTS DURATIONS JSON_FILES

banner() {
  local width=64
  local line; line=$(printf '─%.0s' $(seq 1 $width))
  echo ""
  echo -e "${CYAN}${line}${RESET}"
  printf "${CYAN}│${RESET}  ${BOLD}%-59s${RESET}${CYAN}│${RESET}\n" "$1"
  echo -e "${CYAN}${line}${RESET}"
}

# ── Chạy từng test ────────────────────────────────────────────────────────────
TOTAL_START=$(date +%s)

for TEST in "${TESTS[@]}"; do
  FILE="$DIR/${TEST}.js"

  if [[ ! -f "$FILE" ]]; then
    echo -e "${YELLOW}[SKIP]${RESET} ${TEST}.js không tồn tại"
    RESULTS[$TEST]="SKIP"
    continue
  fi

  banner "[$TEST]  $LUONG/${TEST}.js"
  echo -e "  BASE_URL : ${BASE_URL}"
  echo ""

  START=$(date +%s)
  set +e
  k6 run -e BASE_URL="$BASE_URL" -e QUICK="$QUICK" "$FILE"
  EXIT_CODE=$?
  set -e
  END=$(date +%s)
  DURATIONS[$TEST]=$((END - START))

  LATEST_JSON=$(ls -t "$ROOT/results/${LUONG}-${TEST}-"*.json 2>/dev/null | head -1 || true)
  [[ -n "$LATEST_JSON" ]] && JSON_FILES[$TEST]="$LATEST_JSON"

  if [[ $EXIT_CODE -eq 0 ]]; then
    RESULTS[$TEST]="PASS"
    echo -e "\n  ${GREEN}✓ PASS${RESET}  (${DURATIONS[$TEST]}s)"
  else
    RESULTS[$TEST]="FAIL"
    echo -e "\n  ${RED}✗ FAIL${RESET}  exit=${EXIT_CODE}  (${DURATIONS[$TEST]}s)"
  fi
done

TOTAL_END=$(date +%s)
TOTAL_DURATION=$((TOTAL_END - TOTAL_START))

# ── Báo cáo terminal ──────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}════════════════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}  KẾT QUẢ TỔNG KẾT — ${LUONG}${RESET}"
echo -e "${BOLD}════════════════════════════════════════════════════════════${RESET}"
printf "  %-10s %-8s %s\n" "TEST" "RESULT" "DURATION"
echo "  ──────────────────────────────────────"

PASS=0; FAIL=0; SKIP=0
for TEST in "${TESTS[@]}"; do
  STATUS="${RESULTS[$TEST]:-SKIP}"
  DUR="${DURATIONS[$TEST]:-0}s"
  case "$STATUS" in
    PASS) COLOR=$GREEN; ((PASS++)) ;;
    FAIL) COLOR=$RED;   ((FAIL++)) ;;
    *)    COLOR=$YELLOW; ((SKIP++)) ;;
  esac
  printf "  %-10s ${COLOR}%-8s${RESET} %s\n" "$TEST" "$STATUS" "$DUR"
done

echo "  ──────────────────────────────────────"
echo -e "  Tổng thời gian : ${TOTAL_DURATION}s"
printf "  Pass / Fail / Skip : ${GREEN}%d${RESET} / ${RED}%d${RESET} / ${YELLOW}%d${RESET}\n" $PASS $FAIL $SKIP
echo -e "${BOLD}════════════════════════════════════════════════════════════${RESET}"

# ── Sinh HTML report tổng hợp ─────────────────────────────────────────────────
JSON_ARGS=()
for TEST in "${TESTS[@]}"; do
  [[ -n "${JSON_FILES[$TEST]:-}" ]] && JSON_ARGS+=("${JSON_FILES[$TEST]}")
done

if [[ ${#JSON_ARGS[@]} -gt 0 ]]; then
  echo ""
  python3 "$ROOT/scripts/gen-report.py" "${JSON_ARGS[@]}"
fi

echo ""
[[ $FAIL -eq 0 ]]
