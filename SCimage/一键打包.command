#!/bin/zsh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "${SCRIPT_DIR}"

python3 "${SCRIPT_DIR}/scripts/build_desktop.py" --target macos
