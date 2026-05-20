#!/usr/bin/env bash
# Chạy tất cả smoke test trong tests/*/smoke/.
#
# Usage:
#   ./scripts/run-all-smoke.sh                    # chạy hết
#   ./scripts/run-all-smoke.sh --fail-fast        # dừng ngay khi 1 test fail
#   BASE_URL=http://staging/api ./scripts/run-all-smoke.sh
#
# Output:
#   - Mỗi file in section header + chạy k6 + PASS/FAIL
#   - HTML report lưu vào results/{name}-smoke-{timestamp}.html
#   - SUMMARY tổng cuối cùng

set -uo pipefail
cd "$(dirname "$0")/.."

# Truyền flag (vd --fail-fast) qua run-k6.sh
ARGS=( "$@" )

# Thứ tự module (read-only trước, write/expensive sau)
MODULES=(
  "tests/templates/smoke"
  "tests/rules/smoke"
  "tests/dossiers/smoke"
  "tests/uploads/smoke"
  "tests/assessment/smoke"
  "tests/run-full-flow/smoke"
  "tests/ai-drafts/smoke"      # last vì gọi LLM, có cost
)

echo "════════════════════════════════════════════════════════════"
echo "▶ SMOKE SWEEP — ${#MODULES[@]} modules"
echo "════════════════════════════════════════════════════════════"
for m in "${MODULES[@]}"; do printf '  • %s\n' "$m"; done

bash scripts/run-k6.sh "${ARGS[@]+"${ARGS[@]}"}" "${MODULES[@]}"
