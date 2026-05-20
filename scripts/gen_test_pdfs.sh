#!/usr/bin/env bash
# Wrapper: cài deps Python rồi sinh 10 file PDF test trong data/fixtures/pdfs/
#
# Usage:
#   ./scripts/gen_test_pdfs.sh                 # gen tất cả, skip file đã tồn tại
#   ./scripts/gen_test_pdfs.sh --force         # gen lại toàn bộ
#   ./scripts/gen_test_pdfs.sh --only=invoice  # chỉ gen file có "invoice" trong tên
#   ./scripts/gen_test_pdfs.sh --skip-install  # không pip install
#
# Lưu ý: file 200MB và 500MB mất ~1-3 phút mỗi cái.

set -euo pipefail
cd "$(dirname "$0")/.."

SKIP_INSTALL=false
ARGS=()
for arg in "$@"; do
  case "$arg" in
    --skip-install) SKIP_INSTALL=true ;;
    *) ARGS+=( "$arg" ) ;;
  esac
done

if ! $SKIP_INSTALL; then
  echo "▶ Installing Python deps (reportlab Pillow pypdf)..."
  python3 -m pip install -q reportlab Pillow pypdf
fi

python3 scripts/gen_test_pdfs.py "${ARGS[@]}"
