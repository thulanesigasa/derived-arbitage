# Mobile EA Controller — Deriv Synthetic Indices

A personal Android controller for a Deriv MT5 EA trading Volatility, Boom, Crash, and Step synthetic indices. This project is structured in validated phases — no live trading until every gate passes.

> **Demo only.** This codebase currently connects to a mock control server and the Deriv WebSocket API for read-only market profiling. No trades, no real orders, no broker credentials stored here.

---

## Project Status

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Demo mobile controller + mock server | ✅ Complete |
| 2 | Market Profiler — live Deriv WebSocket data | ✅ Complete |
| 3 | Strategy engine (Falcon FX / SMC signals) | 🔲 Planned |
| 4 | MQL5 EA with independent risk engine | 🔲 Planned |
| 5 | VPS bridge + HTTPS/WSS auth | 🔲 Planned |
| 6 | Live activation gate (demo-proven only) | 🔲 Planned |

---

## Instruments

| Symbol | Group | Code |
|--------|-------|------|
| Volatility 10 Index | Volatility | `R_10` |
| Volatility 50 Index | Volatility | `R_50` |
| Volatility 75 Index | Volatility | `R_75` |
| Volatility 100 Index | Volatility | `R_100` |
| Volatility 100 (1s) Index | Volatility | `1HZ100V` |
| Step Index | Step | `stpRNG` |
| Boom 500 Index | Boom | `BOOM500` |
| Boom 1000 Index | Boom | `BOOM1000` |
| Crash 500 Index | Crash | `CRASH500` |
| Crash 100 Index | Crash | `CRASH300` |

---

## Mobile Development Standards (Rule 15)

- **Target Platforms**: Android (first), iOS
- **Navigation Chrome**: Floating pill bottom navigation bar with a smooth animated sliding indicator (`Animated.spring`), dynamically accounting for OS chrome (Android: 48px gesture chrome; iOS: 34px home indicator)
- **App Bar & Header**: Dedicated App Bar (`56px` Android / `96px` iOS) respecting device status bar height so device time and chrome never overlay header titles
- **Grid & Spacing**: 4-column stretch layout, 16px margins & gutters, 8px grid spacing (8, 16, 24, 32, 48, 56, 64)
- **Touch Targets**: Minimum 48×48dp (Android) / 44×44pt (iOS) across all buttons, tab items, and switches
- **Color System**: 60% Background (`#080808` Pitch Black), 30% Panel (`#161616` Matte Charcoal), 10% Accent (`#FF6B00` Vivid Electric Orange), Text (`#FFFFFF` Pure White)
- **Safe Area Insets**: Handled via `react-native-safe-area-context` (`SafeAreaProvider` + `SafeAreaView` with explicit top/side edges)
- **No Status Badges**: Strictly zero status badges or indicator tags (e.g. READ ONLY, DEMO ONLY, STOPPED, REVIEW, OK) in component UIs (Rule 16)

---

## Quick Start

```powershell
npm install
npm run dev
```

Scan the QR code from Expo Go on Android. The app starts on port **8082**.

If you get port conflicts, run this first:

```powershell
@(8081, 8082, 4000) | ForEach-Object { $port = $_; netstat -ano | Select-String ":$port\s" | ForEach-Object { $procId = ($_ -split '\s+')[-1]; if ($procId -match '^\d+$') { Stop-Process -Id ([int]$procId) -Force -ErrorAction SilentlyContinue } } }
```

---

## Application Sections (5 Tabs)

### 1. Home Tab
- Robot command center with visual robot status avatar and pulse accent
- Primary automation controls: Start Robot, Pause Entries, Resume, Stop
- High-level KPI metrics: Active Equity, Today's P&L, Drawdown, Active Simulations
- Live server bridge heartbeat and connection status

### 2. Controller Tab
- Detailed Risk Guardrails: Absolute equity floor ($15.00), default risk/trade ($0.10), hard max, daily/weekly loss locks, margin ceiling
- Safety Intervention: Emergency Exit button with double confirmation
- Simulated positions list with side, P&L, and simulated indicators
- Monitored instruments: Compact 3-item view with internal nested scroll and custom Uiverse `ToggleSwitch`

### 3. Profiler Tab (Phase 2)
- Live connection to Deriv WebSocket API (`wss://ws.derivws.com`)
- Live spot price, median & P95 spread distributions
- Real-time tick velocity (ticks per second) with sparkline bar
- Affordability assessment against the personal $20.00 / $15.00 risk policy

### 4. Activity Tab
- Full chronological event and audit log
- Real-time timestamps and status category markers
- Complete audit trail of automation state transitions, trade events, and risk limit checks

### 5. Profile Tab
- Account configuration and connectivity hub
- Deriv API credentials: App ID configuration and Read-only API Token
- Test Deriv Connection button verifying live WebSocket status
- MT5 VPS Bridge configuration: Server host, MT5 Server (`DerivSVG-Server-03`), MT5 Account login
- Test Bridge Ping button verifying latency
- Secure local persistence via `@react-native-async-storage/async-storage`

---

## Configuration

Copy `.env.example` to `.env` and edit with your Wi-Fi IPv4 address (find with `Get-NetIPAddress -AddressFamily IPv4`):

```env
# Your computer's Wi-Fi LAN IP (for physical Android device connectivity)
EXPO_PUBLIC_API_URL=http://<YOUR_WIFI_IP>:4000

# Server ports
CONTROL_SERVER_HOST=0.0.0.0
CONTROL_SERVER_PORT=4000

# Deriv WebSocket API (Phase 2)
DERIV_APP_ID=1089           # Public demo app_id — works without registration
DERIV_API_TOKEN=            # Optional read-only token for full symbol data
```

To get real symbol data (spot prices, pip sizes), create a **Read-only** API token at [app.deriv.com/account/api-token](https://app.deriv.com/account/api-token) and set `DERIV_API_TOKEN` in `.env`. **Never** set a write-access or trading token here.

---

## Risk Policy (Demo)

| Guard | Value |
|-------|------:|
| Starting balance | $20.00 |
| Absolute equity floor | $15.00 |
| Max total loss | $5.00 |
| Default risk / trade | $0.10 |
| Hard max risk / trade | $0.20 |
| Daily loss lock | $0.40 |
| Weekly loss lock | $1.00 |
| Max open positions | 1 |
| Max margin usage | 20% |
| Profit cap | None |

---

## Architecture

```
Android App (Expo Go / Expo React Native)
        │  HTTP REST + WebSocket (LAN)
        ▼
Control Bridge Server (Node.js · localhost:4000)
        │  /api/state, /api/control, /api/profiler/*
        ├─── Mock state machine (Phase 1)
        └─── Deriv WebSocket client (Phase 2)
                  │  wss://ws.derivws.com
                  └─── Live tick data, spread profiling
```

**Target architecture (Phase 5+):**
```
Android App → Authenticated HTTPS/WSS Bridge (VPS)
                       → MT5 Terminal
                       → MQL5 EA
                       → DerivSVG-Server-03 (live)
```

---

## Directory Structure

```
derived_arbitage/
├── App.tsx                        # Root: 5-tab router, WebSocket sync, state provider
├── app.json                       # Expo config
├── package.json                   # Scripts + deps (react-native-svg, async-storage, etc.)
├── .env.example                   # Config template (never commit .env)
├── src/
│   ├── api.ts                     # Mobile ↔ server REST/WS client
│   ├── types.ts                   # Shared types (ControllerState, SymbolProfile…)
│   ├── components/
│   │   ├── AppHeader.tsx          # Rule 15 App Bar respecting OS status bar chrome
│   │   ├── TabIcons.tsx           # Svgrepo SVGs for 5 tabs and robot visuals
│   │   └── ToggleSwitch.tsx       # Uiverse.io custom animated pill switch
│   └── screens/
│       ├── HomeScreen.tsx         # Tab 1: Robot center, primary controls, KPIs
│       ├── ControllerScreen.tsx   # Tab 2: Risk guardrails, positions, compact instruments
│       ├── ProfilerScreen.tsx     # Tab 3: Live Deriv market profiler
│       ├── ActivityScreen.tsx     # Tab 4: Chronological event and audit log
│       └── ProfileScreen.tsx      # Tab 5: Account & MT5 VPS connectivity hub
└── server/
    ├── src/
    │   ├── index.ts               # Express server, WS broadcast, endpoints
    │   ├── stateMachine.ts        # Control state machine, idempotency
    │   ├── risk.ts                # Trade risk assessment, lock calculation
    │   └── deriv/                 # Phase 2: Deriv WebSocket integration
    │       ├── derivClient.ts     # WS client, auth, reconnect, tick subs
    │       ├── tickStore.ts       # Rolling tick buffer, spread stats
    │       ├── symbolMap.ts       # Display name ↔ Deriv API code mapping
    │       └── marketProfiler.ts  # Symbol profiling, affordability check
    └── test/
        └── stateMachine.test.ts   # Automated transition tests
```

---

## Scripts

```powershell
npm run dev              # Start server + Expo (combined)
npm run server:dev       # Server only (hot-reload)
npm run expo:start       # Expo only (QR code on port 8082)
npm run typecheck        # TypeScript check (app + server)
npm run test             # Vitest automated tests
npm run check            # typecheck + test
```

---

## Phase 2 Notes — Market Profiler

The profiler uses the Deriv public WebSocket API (`app_id=1089`) by default. With the public app_id, `active_symbols` returns an empty list — the profiler seeds from the known symbol list and still subscribes to tick streams. Real spot prices, pip sizes, and spread data will only appear once Deriv confirms the tick subscription by sending ticks.

**To unlock full data:** create your own Deriv app at [app.deriv.com/account/api-token](https://app.deriv.com/account/api-token), set `DERIV_APP_ID` to your own ID, and optionally set `DERIV_API_TOKEN` with a **Read** scope token.

Affordability assessment is indicative only. Without MT5 lot size and tick value data, we cannot compute exact dollar cost per trade. Full affordability requires Phase 4 (MQL5 EA spec collection).

---

## Production Roadmap (Gated)

```
Android app (Expo Go / standalone APK)
  → HTTPS/WSS bridge with mutual auth (VPS)
  → MT5 terminal (DerivSVG-Server-03)
  → MQL5 EA with independent risk guard
  → Deriv demo account soak test (8–12 weeks)
  → Live activation gate (all gates must pass)
  → Minimum-size live trading (one symbol, reviewed)
```

**Live activation gate (non-negotiable):**
- Profit factor ≥ 1.20 at normal costs, > 1.00 at 2× costs
- Max drawdown < $3 in Monte Carlo (95th percentile)
- No dependency on ≤ 5 lucky trades
- No martingale, grid, or recovery sizing anywhere
- 8+ week demo forward-test within backtest range

---

## Security (Production)

Before any live phase: mutual TLS, short-lived JWT auth, device binding, encrypted audit logs, command reconciliation, reconnect watchdogs, external kill switch, and broker-state verification. Deriv credentials must stay inside the MT5 terminal on the VPS — never in the app, source code, `.env` committed to Git, or mobile storage.
