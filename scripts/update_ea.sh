#!/usr/bin/env bash
# ==============================================================================
# update_ea.sh - Automated MetaTrader 5 FalconEA Synchronizer & Compiler
# ==============================================================================
# Usage:
#   bash scripts/update_ea.sh
#   or ./scripts/update_ea.sh
# ==============================================================================

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MT5_PREFIX="${MT5_PREFIX:-/home/ubuntu/mt5}"
MT5_DIR="${MT5_DIR:-${MT5_PREFIX}/drive_c/Program Files/MetaTrader 5}"
EXPERTS_DIR="${MT5_DIR}/MQL5/Experts"
INCLUDE_DIR="${MT5_DIR}/MQL5/Include"
METAEDITOR_EXE="${MT5_DIR}/MetaEditor64.exe"

echo "=== [1/4] Pulling latest repository updates ==="
cd "${REPO_ROOT}"
git pull

echo "=== [2/4] Syncing MQL5 source files into MT5 directories ==="
mkdir -p "${EXPERTS_DIR}" "${INCLUDE_DIR}"
cp "${REPO_ROOT}/mql5/Experts/FalconEA.mq5" "${EXPERTS_DIR}/"
cp "${REPO_ROOT}/mql5/Include/"*.mqh "${INCLUDE_DIR}/"

echo "=== [3/4] Compiling FalconEA with MetaEditor via Wine ==="
if [ ! -f "${METAEDITOR_EXE}" ]; then
  echo "Error: MetaEditor64.exe not found at: ${METAEDITOR_EXE}" >&2
  exit 1
fi

cd "${MT5_DIR}"
WINEPREFIX="${MT5_PREFIX}" wine MetaEditor64.exe /compile:"MQL5\Experts\FalconEA.mq5" /log

echo "=== [4/4] Verifying compilation result ==="
LOG_FILE="${EXPERTS_DIR}/FalconEA.log"
EX5_FILE="${EXPERTS_DIR}/FalconEA.ex5"

if [ -f "${LOG_FILE}" ]; then
  echo "--- Compilation Log ---"
  cat "${LOG_FILE}"
  echo "------------------------"
fi

if [ -f "${EX5_FILE}" ]; then
  echo "SUCCESS: FalconEA.ex5 successfully generated!"
  ls -la "${EX5_FILE}"
  echo "MT5 will automatically hot-reload the updated EA on the active chart."
else
  echo "ERROR: FalconEA.ex5 was not generated. Review compilation log above." >&2
  exit 1
fi
