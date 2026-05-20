#!/usr/bin/env bash
# Chạy k6 cho 1 file hoặc tất cả file .js dưới 1 thư mục.
#
# Usage:
#   ./scripts/run-k6.sh                              # mặc định: tests/
#   ./scripts/run-k6.sh tests/templates              # tất cả *.js trong tests/templates
#   ./scripts/run-k6.sh tests/templates/list.js      # 1 file
#   ./scripts/run-k6.sh tests/templates tests/rules  # nhiều path
#
# Env vars truyền thẳng vào k6:
#   BASE_URL=http://staging/api ./scripts/run-k6.sh tests/templates
#
# Flags:
#   --fail-fast      dừng ngay khi có 1 test fail (mặc định: chạy hết, báo cuối)
#   --quiet          giảm log k6
#   --                kết thúc parsing, mọi arg sau là path

set -uo pipefail
cd "$(dirname "$0")/.."

FAIL_FAST=false
QUIET_FLAG=""
PATHS=()

for arg in "$@"; do
  case "$arg" in
    --fail-fast) FAIL_FAST=true ;;
    --quiet)     QUIET_FLAG="--quiet" ;;
    -h|--help)   sed -n '2,18p' "$0"; exit 0 ;;
    *)           PATHS+=( "$arg" ) ;;
  esac
done

# Default: chạy tất cả tests/
if [[ ${#PATHS[@]} -eq 0 ]]; then
  PATHS=( "tests" )
fi

command -v k6 >/dev/null || { echo "✗ k6 chưa cài: brew install k6"; exit 1; }

# ── Mở rộng path → danh sách file .js ─────────────────────────────────────────
FILES=()
for p in "${PATHS[@]}"; do
  if [[ -f "$p" ]]; then
    FILES+=( "$p" )
  elif [[ -d "$p" ]]; then
    while IFS= read -r -d '' f; do FILES+=( "$f" ); done \
      < <(find "$p" -type f -name '*.js' -print0 | sort -z)
  else
    echo "✗ không tìm thấy: $p"; exit 1
  fi
done

if [[ ${#FILES[@]} -eq 0 ]]; then
  echo "✗ không có file .js nào trong: ${PATHS[*]}"
  exit 1
fi

# ── Run ──────────────────────────────────────────────────────────────────────
mkdir -p results
PASS_LIST=()
FAIL_LIST=()
TOTAL=${#FILES[@]}
i=0

for f in "${FILES[@]}"; do
  i=$((i + 1))
  echo
  printf '════════════════════════════════════════════════════════════\n'
  printf '▶ [%d/%d] %s\n' "$i" "$TOTAL" "$f"
  printf '════════════════════════════════════════════════════════════\n'

  if k6 run $QUIET_FLAG "$f"; then
    PASS_LIST+=( "$f" )
  else
    FAIL_LIST+=( "$f" )
    if $FAIL_FAST; then
      echo
      echo "✗ FAIL-FAST: dừng do $f thất bại"
      break
    fi
  fi
done

# ── Summary ──────────────────────────────────────────────────────────────────
echo
printf '════════════════════════════════════════════════════════════\n'
printf 'SUMMARY  %d total, %d pass, %d fail\n' \
  "$TOTAL" "${#PASS_LIST[@]}" "${#FAIL_LIST[@]}"
printf '════════════════════════════════════════════════════════════\n'

if (( ${#PASS_LIST[@]} > 0 )); then
  for f in "${PASS_LIST[@]}"; do printf '  ✓ %s\n' "$f"; done
fi
if (( ${#FAIL_LIST[@]} > 0 )); then
  for f in "${FAIL_LIST[@]}"; do printf '  ✗ %s\n' "$f"; done
fi

[[ ${#FAIL_LIST[@]} -eq 0 ]] && exit 0 || exit 1
