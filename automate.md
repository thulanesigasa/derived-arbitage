# Automated MetaTrader 5 Expert Advisor (EA) Update Guide

[![MQL5](https://img.shields.io/badge/MQL5-Expert%20Advisor-blue.svg)](https://www.mql5.com)
[![Wine](https://img.shields.io/badge/Wine-Linux%20Wineprefix-purple.svg)](https://www.winehq.org)
[![MT5](https://img.shields.io/badge/MetaTrader-5-green.svg)](https://www.metatrader5.com)
[![License](https://img.shields.io/badge/License-MIT-orange.svg)](LICENSE)

This document details the automated synchronization and compilation workflow for **FalconEA** running inside MetaTrader 5 on the Ubuntu Linux VPS via Wine.

---

## 1. Quick One-Liner (Run on VPS)

Copy and paste this command directly into your VPS terminal (`ubuntu@deriv-vnic:~$`):

```bash
cd ~/derived-arbitage && git pull && cp mql5/Experts/FalconEA.mq5 "/home/ubuntu/mt5/drive_c/Program Files/MetaTrader 5/MQL5/Experts/" && cp mql5/Include/*.mqh "/home/ubuntu/mt5/drive_c/Program Files/MetaTrader 5/MQL5/Include/" && cd "/home/ubuntu/mt5/drive_c/Program Files/MetaTrader 5" && WINEPREFIX=/home/ubuntu/mt5 wine MetaEditor64.exe /compile:"MQL5\\Experts\\FalconEA.mq5" /log
```

---

## 2. Using the Automated Script

Instead of copying the full one-liner every time, run the bundled script:

```bash
cd ~/derived-arbitage
bash scripts/update_ea.sh
```

Or make it executable and run directly:
```bash
chmod +x scripts/update_ea.sh
./scripts/update_ea.sh
```

---

## 3. How MT5 Hot-Reloading Works

MetaTrader 5 features native runtime file watching:
1. **Compilation Detection**: When `MetaEditor64.exe` finishes compiling, it writes an updated `FalconEA.ex5` binary.
2. **Automatic Reload**: If `FalconEA` is already attached to an active chart in MT5, MT5 detects the updated file timestamp on disk and **automatically unloads and reinitializes the EA on the very next market tick**.
3. **No Chart Interaction Needed**: You do not need to remove the EA, reopen the chart, or restart MT5.

---

## 4. Pipeline Breakdown

| Step | Action | Description |
| :--- | :--- | :--- |
| **1** | `cd ~/derived-arbitage && git pull` | Pulls the latest code, bug fixes, and parameters from GitHub. |
| **2** | `cp mql5/Experts/FalconEA.mq5 "..."` | Copies the updated EA source into MT5's live `MQL5/Experts/` directory. |
| **3** | `cp mql5/Include/*.mqh "..."` | Copies `BridgeClient.mqh` and `RiskEngine.mqh` dependencies into `MQL5/Include/`. |
| **4** | `cd "/home/ubuntu/mt5/..."` | Changes directory to MT5's root folder where `MetaEditor64.exe` resides. |
| **5** | `WINEPREFIX=/home/ubuntu/mt5 wine ...` | Executes MetaEditor in headless CLI mode via Wine to compile `FalconEA.mq5`. |
| **6** | Verification | Writes compilation output to `MQL5/Experts/FalconEA.log` and produces `FalconEA.ex5`. |

---

## 5. Verifying Compilation & Logs

To check the compilation log and verify 0 errors:

```bash
cat "/home/ubuntu/mt5/drive_c/Program Files/MetaTrader 5/MQL5/Experts/FalconEA.log"
```

To verify the binary was generated with current timestamp:

```bash
ls -la "/home/ubuntu/mt5/drive_c/Program Files/MetaTrader 5/MQL5/Experts/FalconEA.ex5"
```

---

## 6. Verifying Bridge Connection in MT5

Inside MetaTrader 5 on the VPS desktop (via XRDP Remote Desktop):
1. **WebRequest Permission**:
   - Open **Tools** -> **Options** -> **Expert Advisors**.
   - Ensure `http://127.0.0.1:4000` is present in **Allow WebRequest for listed URL**.
2. **On-Chart HUD**:
   - The HUD on the chart will show:
     ```
     Bridge Connection: ONLINE (CONNECTED)
     Round-Trip Latency: 0 ms
     ```
3. **Bridge Server Logs**:
   - In terminal, view incoming real-time telemetry:
     ```bash
     pm2 logs deriv-bridge --lines 20
     ```

---

## 7. Windows Local PC Alternative

If compiling on a local Windows PC instead of the Linux VPS, use the PowerShell script:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\update_ea.ps1
```
