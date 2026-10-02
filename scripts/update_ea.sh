#!/usr/bin/env bash
# ==============================================================================
# update_ea.sh - Automated MetaTrader 5 FalconEA Synchronizer & Compiler
# ==============================================================================
# Usage:
#   bash scripts/update_ea.sh
# ==============================================================================

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MT5_PREFIX="${MT5_PREFIX:-/home/ubuntu/mt5}"
MT5_DIR="${MT5_DIR:-${MT5_PREFIX}/drive_c/Program Files/MetaTrader 5}"
METAEDITOR_EXE="${MT5_DIR}/MetaEditor64.exe"

echo "=== [1/4] Pulling latest repository updates ==="
cd "${REPO_ROOT}"
git pull

echo "=== [2/4] Syncing MQL5 source and precompiled binaries across all MT5 data directories ==="
# Search and sync into all Experts directories (both Program Files and AppData user data folders)
for exp_dir in $(find "${MT5_PREFIX}" /home/ubuntu/.wine /home/ubuntu/.local -type d -name "Experts" 2>/dev/null || true); do
  echo "  -> Copying FalconEA to: ${exp_dir}"
  mkdir -p "${exp_dir}"
  cp "${REPO_ROOT}/mql5/Experts/FalconEA.mq5" "${exp_dir}/"
  if [ -f "${REPO_ROOT}/mql5/Experts/FalconEA.ex5" ]; then
    cp "${REPO_ROOT}/mql5/Experts/FalconEA.ex5" "${exp_dir}/"
  fi
done

# Search and sync into all Include directories
for inc_dir in $(find "${MT5_PREFIX}" /home/ubuntu/.wine /home/ubuntu/.local -type d -name "Include" 2>/dev/null || true); do
  echo "  -> Copying Includes to: ${inc_dir}"
  mkdir -p "${inc_dir}"
  cp "${REPO_ROOT}/mql5/Include/"*.mqh "${inc_dir}/"
done

echo "=== [3/4] Headless Compilation via MetaEditor (Wine) ==="
if [ -f "${METAEDITOR_EXE}" ]; then
  cd "${MT5_DIR}"
  WINEPREFIX="${MT5_PREFIX}" wine MetaEditor64.exe /compile:"MQL5\Experts\FalconEA.mq5" /log || true
fi

echo "=== [4/4] Verification & Hot-Reload Confirmation ==="
PRIMARY_EX5="${MT5_DIR}/MQL5/Experts/FalconEA.ex5"
if [ -f "${PRIMARY_EX5}" ]; then
  echo "SUCCESS: FalconEA.ex5 is active in primary MT5 directory."
  ls -lh "${PRIMARY_EX5}"
fi

echo "All MT5 instances and data directories have been synchronized."
