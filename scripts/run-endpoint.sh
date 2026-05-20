#!/usr/bin/env bash
#
# Chạy smoke test cho 1 endpoint cụ thể (wrapper mỏng quanh run-smoke.sh).
#
# Usage:
#   bash scripts/run-endpoint.sh <endpoint-path>
#
# <endpoint-path> chấp nhận:
#   auth/post-login                   (sẽ resolve qua run-smoke.sh)
#   identity/auth/post-login
#   admin/monitor/get-overview
#   tests/identity/auth/post-login/smoke.js
#
# Ví dụ:
#   bash scripts/run-endpoint.sh auth/post-login
#   bash scripts/run-endpoint.sh admin/monitor/get-overview
#   BASE_URL=http://staging:29002/api bash scripts/run-endpoint.sh auth/get-me

set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if (( $# < 1 )); then
  echo "Usage: bash scripts/run-endpoint.sh <endpoint-path>" >&2
  echo "Example: bash scripts/run-endpoint.sh auth/post-login" >&2
  exit 1
fi

exec bash "$ROOT/scripts/run-smoke.sh" "$1"
