# Mobile EA Controller — Deriv Synthetic Indices

A personal Android controller for a Deriv MT5 EA trading Volatility, Boom, Crash, and Step synthetic indices. This project is structured in validated phases — no live trading until every gate passes.

> **Demo only.** This codebase currently connects to a mock control server and the Deriv WebSocket API for read-only market profiling. No trades, no real orders, no broker credentials stored here.

---

## Project Status

| Phase | Description | Status |
|---|---|:---:|
| 1 | Demo mobile controller + mock server | ✅ Complete |
| 2 | Market Profiler — live Deriv WebSocket data | ✅ Complete |
| 3 | Strategy engine (Falcon FX / SMC signals) | ✅ Complete |
| 4 | MQL5 EA with independent risk engine | ✅ Complete |
| 5 | VPS bridge + HTTPS/WSS auth | ✅ Complete |
| 6 | Live activation gate (demo-proven only) | ✅ Complete |

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
- **Navigation Chrome**: Floating pill bottom navigation bar with a smooth animated sliding underline indicator (`Animated.spring`) positioned directly below the active tab, dynamically accounting for OS chrome (Android: 48px gesture chrome; iOS: 34px home indicator)
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

## Network Connectivity & Connection Resilience

When switching between Wi-Fi networks (e.g. home vs. office) or running on different clients (web browser, Android phone, Android emulator), IP addresses can change. The mobile controller includes multi-layer connection resilience:

1. **Web Browser Automatic Host Matching**:
   - When opened in a browser (e.g., `http://localhost:8082` or `http://10.186.129.215:8082`), the app automatically targets `http://${window.location.hostname}:4000`, avoiding stale LAN IPs.
2. **Multi-Host Auto-Discovery (`src/api.ts`)**:
   - Requests enforce a strict 3,500ms timeout with `AbortController` to eliminate infinite loading spinners.
   - If the initial host is unreachable, `probeCandidateUrls()` automatically tests known candidate endpoints in parallel/sequence (`http://10.186.129.215:4000`, `http://localhost:4000`, `http://127.0.0.1:4000`, `http://10.0.2.2:4000`) and self-heals by switching to the first responding host.
3. **Connection Recovery Screen (`App.tsx`)**:
   - If the server bridge cannot be reached, the app displays a responsive recovery screen with:
     - Error diagnostics and current target URL
     - Quick-switch host chips for instant one-tap switching
     - Custom URL input field
     - **Launch Offline Demo** mode button, allowing complete offline inspection of the UI without network dependency.
4. **Profile Bridge Synchronization (`ProfileScreen.tsx`)**:
   - Setting `bridgeUrl` in Profile instantly synchronizes `API_BASE_URL` and persists across app restarts via AsyncStorage.

---

## Application Sections (5 Tabs)

### 1. Home Tab (Cybernetic Robot Command Center)
- **High-tech Robot Hero Banner**: Futuristic cybernetic AI robot character with gradient identity overlay
- **3-Button Quick Action Dock**:
  - `START / PAUSE`: Primary execution toggle with tactile SVG action indicators
  - `QUOTES`: Instant sliding shortcut to the live Profiler tab with market spreads & pips
  - `STOP`: Immediate emergency stop halts all automated signals safely
- **Active Robot Instance Card**:
  - Robot avatar thumbnail with neon orange status ring
  - Live monospace terminal console line (`>> [timestamp] Signal engine active · Monitoring 10 synthetic feeds`)
  - Server bridge heartbeat indicator
- **Performance & Portfolio KPIs**: Large active equity metric, Today P&L, Max Drawdown, and position counters
- **Falcon FX Execution Parameters**: SMC signal engine rules, risk per trade, stop loss model, and daily loss locks

### 2. Controller Tab
- Detailed Risk Guardrails: Absolute equity floor ($15.00), default risk/trade ($0.10), hard max, daily/weekly loss locks, margin ceiling
- Safety Intervention: Emergency Exit button with double confirmation
- Simulated positions list with side, P&L, and simulated indicators
- Monitored instruments: Compact 3-item view with internal nested scroll and custom Uiverse `ToggleSwitch`

### 3. Profiler & SMC Signals Tab
- **Dual-View Segment Control**:
  - `PROFILES`: Live spot price, median & P95 spread distributions, real-time tick velocity sparkline, and affordability indicators across all 10 synthetic instruments.
  - `SMC SIGNALS`: Live real-time feed of active and recent trade setups generated by the Falcon FX & SMC engine (Break of Structure, Liquidity Sweeps, CHoCH, Fair Value Gap Retests) with direction, entry, SL, TP, and R:R ratios.
- **SMC Market Structure Inspection Modal (`SmcStructureModal`)**:
  - Tap `SMC Structure` on any instrument card to inspect real-time Trend Bias (`BULLISH`/`BEARISH`/`RANGING`), last Break of Structure (BOS), Change of Character (CHoCH), active unmitigated Fair Value Gaps (FVG), dynamic ATR, and a live SVG candlestick sparkline.

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
        │  HTTPS REST + Authenticated WSS (Bearer JWT / API Key)
        ▼
VPS Control Bridge Server (Node.js · VPS / Host:4000)
        │  /api/auth/*, /api/gates/*, /api/state, /api/control, /api/profiler/*, /api/mt5/*
        ├─── Security & Auth Manager (Phase 5: JWT, API Key, Device Binding, Rate Limiting)
        ├─── Live Activation Gate Engine (Phase 6: 5 Non-Negotiable Quantitative Gates)
        ├─── Controller Store & State Machine (Phase 1: Invariant Guardrails & State Locks)
        ├─── Deriv WebSocket Client (Phase 2: Live ticks, median/P95 spread profiling)
        ├─── Strategy Engine (Phase 3: Candle aggregation, SMC BOS/CHoCH/FVG, Falcon sweeps)
        └─── MT5 Server Bridge (Phase 4: Telemetry ingestion, command queueing, watchdog)
                  │  HTTP WebRequest (x-api-key authenticated)
                  ▼
MetaTrader 5 Terminal (DerivSVG-Server-03)
        └─── FalconEA.mq5 (MQL5 Expert Advisor with On-Chart HUD)
                  ├─── RiskEngine.mqh (1,243-Line Client-Side Invariant Suite)
                  └─── BridgeClient.mqh (HTTP WebRequest Client with Idempotency)
```

---

## Directory Structure

```
derived_arbitage/
├── App.tsx                        # Root: 5-tab router, animated sliding dock, state provider
├── app.json                       # Expo config
├── package.json                   # Scripts + deps (react-native-svg, async-storage, etc.)
├── .env.example                   # Config template (never commit .env)
├── assets/
│   └── robot_hero.jpg             # Cybernetic AI robot asset for Home hero & avatar
├── mql5/                          # Phase 4: Native MetaTrader 5 Expert Advisor & Risk Engine
│   ├── Experts/
│   │   └── FalconEA.mq5           # Falcon FX & SMC Execution EA with timer & tick hooks
│   └── Include/
│       ├── RiskEngine.mqh         # Independent native risk engine ($15 floor, $0.40 loss lock)
│       └── BridgeClient.mqh       # MQL5 WebRequest HTTP client for server bridge communication
├── src/
│   ├── api.ts                     # Mobile ↔ server REST/WS client with Bearer JWT injection
│   ├── types.ts                   # Shared types (ControllerState, StrategySignal, Gate, Auth…)
│   ├── components/
│   │   ├── AppHeader.tsx          # Rule 15 App Bar respecting OS status bar chrome
│   │   ├── LiveActivationModal.tsx# Phase 6: Live activation gate inspection & transition modal
│   │   ├── SmcStructureModal.tsx  # Market structure modal with SVG candle sparklines
│   │   ├── TabIcons.tsx           # Svgrepo SVGs for tabs, status indicators, and robot visuals
│   │   └── ToggleSwitch.tsx       # Uiverse.io custom animated pill switch
│   └── screens/
│       ├── HomeScreen.tsx         # Tab 1: Robot center, primary controls, KPIs, active trade
│       ├── ControllerScreen.tsx   # Tab 2: Risk guardrails, positions, Live Activation Gate
│       ├── ProfilerScreen.tsx     # Tab 3: Live Deriv market profiler & SMC signals
│       ├── ActivityScreen.tsx     # Tab 4: Chronological event and audit log
│       └── ProfileScreen.tsx      # Tab 5: VPS bridge auth & account connectivity hub
└── server/
    ├── src/
    │   ├── index.ts               # Express server, WS broadcast, REST endpoints
    │   ├── stateMachine.ts        # Control state machine, idempotency, live mode transition
    │   ├── risk.ts                # Trade risk assessment, lock calculation
    │   ├── auth/                  # Phase 5: VPS Bridge Security & Auth
    │   │   └── authMiddleware.ts  # Bearer JWT, constant-time API key, device binding, rate limit
    │   ├── gates/                 # Phase 6: Live Activation Gate Engine
    │   │   └── activationGate.ts  # 5 Non-negotiable gates, Monte Carlo simulation, soak records
    │   ├── deriv/                 # Phase 2: Deriv WebSocket integration
    │   │   ├── derivClient.ts     # WS client, auth, reconnect, tick subs
    │   │   ├── tickStore.ts       # Rolling tick buffer, spread stats
    │   │   ├── symbolMap.ts       # Display name ↔ Deriv API code mapping
    │   │   └── marketProfiler.ts  # Symbol profiling, affordability check, onTick emitter
    │   ├── strategy/              # Phase 3: Strategy Engine (Falcon FX / SMC Signals)
    │   │   ├── candleAggregator.ts# M1/M5 candle reconstruction + dynamic ATR
    │   │   ├── smcDetector.ts     # Swing fractals, BOS, CHoCH, Fair Value Gaps
    │   │   ├── falconEngine.ts    # Falcon FX liquidity sweeps & continuation signals
    │   │   └── executionEngine.ts # Paper execution lifecycle, live tick P&L, TP/SL
    │   └── mt5/                   # Phase 4: Server-side MT5 Bridge
    │       └── mt5Bridge.ts       # Telemetry ingestion, command queueing, watchdog
    └── test/
        ├── stateMachine.test.ts   # Automated state machine transition tests
        ├── strategyEngine.test.ts # Strategy, candle, SMC, and execution tests
        ├── mt5Bridge.test.ts      # MT5 bridge telemetry, queueing, and watchdog tests
        ├── authBridge.test.ts     # Phase 5: JWT, API key, device binding, rate limiter tests
        └── activationGate.test.ts # Phase 6: 5-gate validation & Monte Carlo drawdown tests
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

---

## Phase 3 Notes — Strategy Engine (Falcon FX / SMC Signals)

The Strategy Engine reconstructs multi-timeframe candles from the Deriv live tick stream and detects Smart Money Concepts (SMC) & Falcon FX market structures:

- **Candle Aggregator (`server/src/strategy/candleAggregator.ts`)**: Ingests live ticks into rolling M1/M5 bars and computes dynamic 14-period Average True Range (ATR).
- **SMC Pattern Detector (`server/src/strategy/smcDetector.ts`)**: Detects 5-bar swing fractals, Break of Structure (BOS), Change of Character (CHoCH), and Fair Value Gaps (FVG).
- **Falcon Engine (`server/src/strategy/falconEngine.ts`)**: Synthesizes continuation flags, liquidity sweep reversals, dynamic ATR 1.5x stop losses, and strictly enforces a minimum **1:2.5 Risk-to-Reward ratio**.
- **Execution Engine (`server/src/strategy/executionEngine.ts`)**: Manages simulated position lifecycles, real-time unrealized P&L tracking, automated TP (`+$0.25`) and SL (`-$0.10`) execution under our conservative **$0.10 risk** / **$15.00 equity floor** policy.
- **REST Endpoints**:
  - `GET /api/strategy/signals`: Active and recent high-probability signals across all selected symbols.
  - `GET /api/strategy/candles/:code`: Recent aggregated candles (OHLCV) for chart analysis.
  - `GET /api/strategy/structure/:code`: Live SMC market structure & ATR analysis.

---

## Phase 4 Notes — MQL5 EA with Institutional 1000-Line Risk Engine

Phase 4 implements a native, enterprise-grade MetaTrader 5 Expert Advisor and client-side risk suite designed for Deriv synthetic indices (`DerivSVG-Server-03`):

- **Institutional Native Risk Engine (`mql5/Include/RiskEngine.mqh` — 1,243 lines)**:
  - **Capital Preservation Invariants**:
    - **Absolute Equity Floor**: Hard minimum `$15.00` USD with `$16.00` pre-warning defense. If terminal equity drops to or below $15.00, an emergency multi-pass flatten closes all open positions across all symbols and permanently locks trading.
    - **Daily Loss Lock**: Max `$0.40` USD daily loss threshold (accounting for closed deals, commissions, swaps, and floating P&L). Resets automatically at 00:00 server time.
    - **Weekly Loss Lock ($1.00) & Max Total Drawdown ($5.00)**: Multi-timeframe safety limits protecting capital against regime shifts.
    - **Consecutive Loss Circuit Breaker**: 3 consecutive losses automatically triggers a mandatory 1-hour (`3600s`) cooldown period.
  - **Dynamic Sizing & Pre-Trade Guards**:
    - **Fractional Lot Sizing**: Computes exact lots from dollar risk: $\text{Lots} = \frac{\text{RiskUSD}}{\text{SL Distance Points} \times \text{TickValue} / \text{TickSize}}$ with broker `LotsMin`, `LotsMax`, and `LotsStep` step normalization.
    - **Margin Ceiling Guard**: Pre-calculates required margin via `OrderCalcMargin()` to ensure total margin usage never exceeds 20.0% of balance.
    - **Spread & Freeze Level Filter**: Rejects orders if the current spread exceeds allowable limits (`600 pts`) or if SL/TP is placed within broker freeze/stops levels.
    - **Mandatory Hard Stop Loss**: Market orders without an explicit, valid SL are rejected in the MT5 terminal thread before ever reaching the broker.
  - **Active Trade Lifecycle Defense**:
    - **Dynamic Break-Even**: Locks in entry + 2 points profit once price reaches `1.5 R:R` in profit.
    - **Dynamic Trailing Stop**: Trails SL at a configurable buffer (`30 pts`) in discrete steps (`10 pts`) as profits expand.
  - **Flight Recorder & Audit Logging**:
    - Persistent CSV disk logging (`MQL5/Files/falcon_risk_audit_YYYYMMDD.csv`) recording every tick check, order validation, rejection code, and financial metric.
    - In-memory ring buffer (64 entries) for instant querying and HUD visualization.

- **Resilient Bridge Client (`mql5/Include/BridgeClient.mqh` — 450 lines)**:
  - Native MQL5 JSON parser (`CSimpleJsonParser`) handling unquoted literals, string properties, numbers, booleans, and command array deserialization without external libraries.
  - Asynchronous HTTP `WebRequest()` client with round-trip latency tracking (`PingMs`), consecutive error detection, and success rate metrics.
  - Idempotency buffer (64 commands) guaranteeing no command is ever executed twice if polled concurrently.
  - Order execution feedback streaming (`SendOrderResult`) reporting fill prices, execution slippage in points, and return status codes.

- **Falcon Expert Advisor (`mql5/Experts/FalconEA.mq5` — 445 lines)**:
  - **On-Chart Heads-Up Display (HUD)**: Monospace terminal canvas rendering account equity, balance, free margin, margin usage %, peak equity, active risk invariant locks, cooldown timers, bridge connection latency, and open positions.
  - `OnTick()`: Sub-millisecond invariant verification on every incoming price tick and dynamic position defense.
  - `OnTimer()`: 1-second cadence syncing telemetry, polling pending commands (`EXECUTE_ORDER`, `CLOSE_POSITION`, `FLATTEN_ALL`, `PING`), and updating on-chart visual telemetry.
  - `OnTradeTransaction()`: Real-time closed deal detection (`TRADE_TRANSACTION_DEAL_ADD`) updating win/loss streaks and audit metrics instantly upon trade completion.

- **Server MT5 Bridge (`server/src/mt5/mt5Bridge.ts`)**:
  - Endpoints:
    - `POST /api/mt5/telemetry`: Real-time telemetry ingestion reconciling live MT5 balance, equity, margin, daily PnL, open positions, and lock states into `ControllerStore`.
    - `GET /api/mt5/commands`: Terminal command polling endpoint.
    - `POST /api/mt5/order-result`: Ingests fills, slippage, and rejections from MT5.
    - `GET /api/mt5/status`: Live bridge connection status with a 10-second watchdog timeout.
    - `POST /api/mt5/flatten`: Remote emergency flatten kill switch.

---

## Phase 5 Notes — VPS Bridge + HTTPS/WSS Auth

Phase 5 establishes a hardened security perimeter for remote VPS deployments:

- **Cryptographic Bearer JWT Tokens**: Mobile clients exchange a master API key and unique device identifier for 24-hour signed HMAC-SHA256 JWT tokens via `POST /api/auth/token`.
- **Constant-Time API Key Verification**: Uses `crypto.timingSafeEqual` to eliminate timing side-channel attacks on header authentication (`x-api-key`).
- **Device ID Binding**: Mobile requests are bound to enrolled device identifiers (`x-device-id`), preventing token sharing or unauthorized device access.
- **Token-Bucket Rate Limiting**: In-memory rate limiting shields control endpoints from brute-force attempts.
- **Authenticated WebSocket Streams**: WebSocket connections (`/ws`) require a valid JWT token query parameter (`/ws?token=...`) or API key to subscribe to real-time state broadcasts.
- **REST Endpoints**:
  - `POST /api/auth/token`: Exchanges API key + device ID for signed Bearer JWT.
  - `POST /api/auth/device/register`: Registers a new mobile device.
  - `GET /api/auth/devices`: Lists enrolled authorized devices.

---

## Phase 6 Notes — Live Activation Gate (Demo-Proven Only)

Phase 6 implements a strict, non-negotiable verification engine that locks live capital trading until a strategy proves its statistical edge under real forward-testing conditions:

- **The 5 Non-Negotiable Gates (`server/src/gates/activationGate.ts`)**:
  1. **Profit Factor Gate**: Profit Factor ($\text{Gross Profit} / \text{Gross Loss}$) must be $\ge 1.20$, and must remain positive under a **2x cost stress test** (simulating spread expansions and commissions).
  2. **Monte Carlo 95th Percentile Drawdown Gate**: Executes 1,000 bootstrap resamplings over historical trade returns; the 95th percentile simulated max drawdown must be $< \$3.00$.
  3. **Outlier Independence Gate**: Net profit excluding the top 5 largest winning trades must remain $> \$0.00$ (ensuring profitability stems from consistent edge rather than lucky windfall spikes).
  4. **Strict Sizing Discipline Gate**: Verifies zero Martingale, grid, or recovery sizing. Risk per trade must never exceed $\$0.20$, and position size must never increase following a loss.
  5. **Demo Soak Period Gate**: Forward-test demo record must span at least 8 weeks (56 days) with a minimum of 80+ completed trades.
- **State Machine Mode Lock (`server/src/stateMachine.ts`)**:
  - The controller mode is locked to `DEMO` by default.
  - Calling `POST /api/gates/activate-live` runs the quantitative verification engine. If **any** gate fails, transition is strictly rejected with HTTP 403 (`ACTIVATION_GATE_LOCKED`).
- **Mobile Inspection Modal (`LiveActivationModal.tsx`)**:
  - Accessible via Controller tab.
  - Displays audit status, total demo trades evaluated, soak test duration, 95% Monte Carlo drawdown, and individual checkmarks for each mandatory gate adhering strictly to Rule 1 and Rule 16.
