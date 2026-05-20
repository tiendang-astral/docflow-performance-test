#!/usr/bin/env bash
# Chạy tất cả stress test qua các bậc MAX_VU.
#
# Bậc VU:
#   - Normal modules  (templates, rules, dossiers, uploads): 50, 100, 150, 200, 250, 300
#   - Heavy  modules  (ai-drafts, assessment, run-full-flow): 10, 20, 30, 40, 50
#
# Mỗi file stress dùng stages.stress với MAX_VU env var:
#   ramp 20s → hold 1m @ MAX_VU → ramp 20s → tổng ~100s/file
#
# Tổng ước lượng:
#   Normal: 4 modules × ~5 files × 6 VU bậc = ~120 runs × 100s ≈ 3.5 giờ
#   Heavy : 3 modules × ~3 files × 5 VU bậc = ~45 runs × 100s ≈ 1.2 giờ
#   Tổng ≈ 5 giờ. Cân nhắc trước khi chạy full.
#
# Usage:
#   ./scripts/run-all-stress.sh                    # chạy hết
#   ./scripts/run-all-stress.sh --normal-only      # chỉ normal modules
#   ./scripts/run-all-stress.sh --heavy-only       # chỉ heavy modules
#   ./scripts/run-all-stress.sh --quick            # 1 bậc duy nhất (NORMAL=50, HEAVY=10)
#   BASE_URL=http://staging/api ./scripts/run-all-stress.sh

set -uo pipefail
cd "$(dirname "$0")/.."

MODE="all"
PASS_THROUGH=()
for arg in "$@"; do
  case "$arg" in
    --normal-only) MODE="normal" ;;
    --heavy-only)  MODE="heavy" ;;
    --quick)       MODE="quick" ;;
    -h|--help)     sed -n '2,30p' "$0"; exit 0 ;;
    *)             PASS_THROUGH+=( "$arg" ) ;;
  esac
done

# ── Định nghĩa modules + VU bậc ─────────────────────────────────────────────
NORMAL_MODULES=(
  "tests/templates/stress"
  "tests/rules/stress"
  "tests/dossiers/stress"
  "tests/uploads/stress"
)
HEAVY_MODULES=(
  "tests/assessment/stress"
  "tests/run-full-flow/stress"
  "tests/ai-drafts/stress"
)

NORMAL_VUS=(50 100 150 200 250 300)
HEAVY_VUS=(10 20 30 40 50)

if [[ "$MODE" == "quick" ]]; then
  NORMAL_VUS=(50)
  HEAVY_VUS=(10)
fi

# ── Counters ─────────────────────────────────────────────────────────────────
PASS_COUNT=0
FAIL_COUNT=0
PASS_LIST=()
FAIL_LIST=()

run_sweep() {
  local label="$1"; shift
  local -a vus_ref="$1"[@]; shift
  local -a modules_ref="$1"[@]; shift
  local vus=( "${!vus_ref}" )
  local modules=( "${!modules_ref}" )

  for vu in "${vus[@]}"; do
    printf '\n╔══════════════════════════════════════════════════════════╗\n'
    printf '║  %s — MAX_VU=%-3d                                ║\n' "$label" "$vu"
    printf '╚══════════════════════════════════════════════════════════╝\n'
    for mod in "${modules[@]}"; do
      while IFS= read -r -d '' f; do
        printf '\n──── [VU=%d] %s ────\n' "$vu" "$f"
        if MAX_VU="$vu" k6 run "$f"; then
          PASS_COUNT=$((PASS_COUNT + 1))
          PASS_LIST+=( "VU=$vu $f" )
        else
          FAIL_COUNT=$((FAIL_COUNT + 1))
          FAIL_LIST+=( "VU=$vu $f" )
        fi
      done < <(find "$mod" -type f -name '*.js' -print0 | sort -z)
    done
  done
}

# ── Dispatch ────────────────────────────────────────────────────────────────
command -v k6 >/dev/null || { echo "✗ k6 chưa cài: brew install k6"; exit 1; }
mkdir -p results

case "$MODE" in
  all|quick)
    run_sweep "NORMAL" NORMAL_VUS NORMAL_MODULES
    run_sweep "HEAVY"  HEAVY_VUS  HEAVY_MODULES
    ;;
  normal)
    run_sweep "NORMAL" NORMAL_VUS NORMAL_MODULES
    ;;
  heavy)
    run_sweep "HEAVY" HEAVY_VUS HEAVY_MODULES
    ;;
esac

# ── Summary ──────────────────────────────────────────────────────────────────
echo
echo '════════════════════════════════════════════════════════════'
printf 'SWEEP SUMMARY  %d total, %d pass, %d fail\n' \
  "$((PASS_COUNT + FAIL_COUNT))" "$PASS_COUNT" "$FAIL_COUNT"
echo '════════════════════════════════════════════════════════════'
if (( ${#FAIL_LIST[@]} > 0 )); then
  echo "FAILS:"
  for f in "${FAIL_LIST[@]}"; do printf '  ✗ %s\n' "$f"; done
fi

[[ $FAIL_COUNT -eq 0 ]] && exit 0 || exit 1
