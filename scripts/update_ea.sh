#!/usr/bin/env bash
# ==============================================================================
# update_ea.sh - Automated MetaTrader 5 FalconEA Synchronizer & Compiler
# ==============================================================================
# Usage:
#   bash scripts/update_ea.sh
# ==============================================================================

set -eo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MT5_PREFIX="${MT5_PREFIX:-/home/ubuntu/mt5}"
MT5_DIR="${MT5_DIR:-${MT5_PREFIX}/drive_c/Program Files/MetaTrader 5}"
METAEDITOR_EXE="${MT5_DIR}/MetaEditor64.exe"

echo "=== [1/5] Pulling latest repository updates ==="
cd "${REPO_ROOT}"
git pull origin master || true

echo "=== [2/5] Cleaning up legacy word-split artifacts ==="
rm -rf "${MT5_PREFIX}/drive_c/Program" "${REPO_ROOT}/5" 2>/dev/null || true

echo "=== [3/5] Explicitly Syncing Primary MT5 MQL5 Directory ==="
mkdir -p "${MT5_DIR}/MQL5/Experts" "${MT5_DIR}/MQL5/Include"
cp -f "${REPO_ROOT}/mql5/Experts/FalconEA.mq5" "${MT5_DIR}/MQL5/Experts/"
if [ -f "${REPO_ROOT}/mql5/Experts/FalconEA.ex5" ]; then
  cp -f "${REPO_ROOT}/mql5/Experts/FalconEA.ex5" "${MT5_DIR}/MQL5/Experts/"
fi
cp -f "${REPO_ROOT}/mql5/Include/"*.mqh "${MT5_DIR}/MQL5/Include/"
echo "Primary MT5 MQL5 directory synced successfully."

echo "=== [4/5] Multi-Directory Synchronization with Whitespace Protection ==="
for search_root in "${MT5_PREFIX}" "/home/ubuntu/.wine" "/home/ubuntu/.local"; do
  if [ -d "${search_root}" ]; then
    while IFS= read -r exp_dir; do
      [ -n "${exp_dir}" ] && [ -d "${exp_dir}" ] || continue
      echo "  -> Copying FalconEA to: ${exp_dir}"
      mkdir -p "${exp_dir}"
      cp -f "${REPO_ROOT}/mql5/Experts/FalconEA.mq5" "${exp_dir}/"
      if [ -f "${REPO_ROOT}/mql5/Experts/FalconEA.ex5" ]; then
        cp -f "${REPO_ROOT}/mql5/Experts/FalconEA.ex5" "${exp_dir}/"
      fi
    done < <(find "${search_root}" -type d -name "Experts" 2>/dev/null || true)

    while IFS= read -r inc_dir; do
      [ -n "${inc_dir}" ] && [ -d "${inc_dir}" ] || continue
      echo "  -> Copying Includes to: ${inc_dir}"
      mkdir -p "${inc_dir}"
      cp -f "${REPO_ROOT}/mql5/Include/"*.mqh "${inc_dir}/"
    done < <(find "${search_root}" -type d -name "Include" 2>/dev/null || true)
  fi
done

echo "=== [5/5] Headless Compilation via MetaEditor (Wine) ==="
if [ -f "${METAEDITOR_EXE}" ]; then
  cd "${MT5_DIR}"
  rm -f "${MT5_DIR}/logs/metaeditor.log" "${MT5_DIR}/metaeditor.log" 2>/dev/null || true
  WINEPREFIX="${MT5_PREFIX}" wine MetaEditor64.exe /compile:"MQL5\Experts\FalconEA.mq5" /log || true
  sleep 1
  if [ -f "${MT5_DIR}/logs/metaeditor.log" ]; then
    iconv -f UTF-16LE -t UTF-8 "${MT5_DIR}/logs/metaeditor.log" 2>/dev/null || cat "${MT5_DIR}/logs/metaeditor.log"
  elif [ -f "${MT5_DIR}/metaeditor.log" ]; then
    iconv -f UTF-16LE -t UTF-8 "${MT5_DIR}/metaeditor.log" 2>/dev/null || cat "${MT5_DIR}/metaeditor.log"
  fi
fi

PRIMARY_EX5="${MT5_DIR}/MQL5/Experts/FalconEA.ex5"
if [ -f "${PRIMARY_EX5}" ]; then
  echo "SUCCESS: FalconEA.ex5 is compiled and active:"
  ls -lh "${PRIMARY_EX5}"
fi
