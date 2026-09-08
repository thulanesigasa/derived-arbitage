# Mobile EA Controller — Demo MVP

A polished Android-first Expo controller for a **local, simulated** execution service. This MVP does not connect to Deriv, MT5, a VPS, a broker price feed, or any trading account. It never requests credentials and it cannot place an order.

## What this MVP proves

- A phone controller can receive live state over WebSocket and send idempotent control commands.
- Start, Pause, Resume, Stop, and confirmed Emergency Exit follow a validated server state machine.
- Risk policy is visible in the app and enforced on the mock server, especially the absolute **$15 equity floor**.
- All ten requested synthetic instruments can be included in a simulated monitoring watchlist.
- A server restart is predictable: the demo returns to `stopped`, clears transient state, creates a new server instance ID, and records the restart in the activity log.

Strategy and trade generation are deliberately absent. Any later Falcon FX/SMC-inspired or relative-value features must be statistically tested and independently risk-reviewed. They must never be described as guaranteed arbitrage or guaranteed profit.

## Requirements

- Windows 10/11 with Node.js 20 or newer
- An Android phone with [Expo Go](https://expo.dev/go)
- The computer and phone on the same private Wi-Fi/LAN

## Quick start

Open PowerShell in this folder:

```powershell
npm install
npm run dev
```

The combined command starts the local mock server and Expo. Expo keeps its QR code in the terminal. Scan it from Expo Go on Android.

If combined terminal rendering is awkward, use two PowerShell windows:

```powershell
npm run server:dev
```

```powershell
npm run expo:start
```

The mock server health check is [http://localhost:4000/health](http://localhost:4000/health). It explicitly returns `mode: DEMO` and `simulated: true`.

## Physical Android phone and LAN setup

Expo Go normally tells the app which LAN address served the bundle. The app derives the control API as `http://<that-computer-ip>:4000`, so no setup is usually needed.

If automatic discovery is wrong:

1. Run `ipconfig` and find the computer's active Wi-Fi/Ethernet **IPv4 Address** (for example `192.168.1.42`).
2. Copy `.env.example` to `.env`.
3. Set `EXPO_PUBLIC_API_URL=http://192.168.1.42:4000` using your real address.
4. Restart `npm run dev` after changing `.env`.

The exact API URL in use is shown at the bottom of the app and on its offline screen.

If the phone cannot connect:

- Confirm both devices are on the same network and disable mobile-data switching temporarily.
- Avoid guest Wi-Fi or access-point isolation, which blocks device-to-device traffic.
- Allow Node.js on **Private networks** if Windows Defender Firewall prompts. If no prompt appears, create a private-network inbound rule for TCP ports `4000` (mock API) and `8081` (Expo development server). Do not expose these demo ports on a public network or router.
- Test `http://<computer-ip>:4000/health` in the phone browser. A JSON response means the LAN path works.

## Controls and semantics

- **Start:** asks the mock server to enter `starting`, then `running`.
- **Pause:** blocks new simulated entries while retaining open-position management semantics.
- **Resume:** returns a paused demo to running after risk locks are checked.
- **Stop:** ends automation but preserves connection/monitoring and does not abandon an open simulated position.
- **Emergency Exit:** uses a separate confirmation and predictably clears every simulated position before returning to stopped.

Every mutation includes a unique request ID and expected state revision. Retried request IDs return the original acknowledgement; stale revisions are rejected instead of silently applying a command to changed state.

## Fixed demo risk policy

| Guard | Value |
|---|---:|
| Initial simulated balance | $20.00 |
| Absolute equity floor | $15.00 |
| Maximum total loss | $5.00 |
| Default risk per trade | $0.10 |
| Hard risk maximum until validated | $0.20 |
| Daily loss lock | $0.40 |
| Weekly loss lock | $1.00 |
| Maximum open positions | 1 |
| Maximum margin usage | 20% |
| Profit cap | None |

## Architecture

```text
┌──────────────────────────────┐       LAN REST + WebSocket       ┌────────────────────────────┐
│ Android / Expo Go            │ ───────────────────────────────▶ │ Local mock control server  │
│ UI, status, guarded controls │ ◀─────────────────────────────── │ State machine + risk gates │
└──────────────────────────────┘          simulated state          └────────────────────────────┘
                                                                      │
                                                                      └── No broker / MT5 link
```

Code boundaries are intentional:

- `src/api.ts` is the phone-side bridge client and configurable API boundary.
- `server/src/stateMachine.ts` owns control transitions, revision checks, idempotency, and server acknowledgements.
- `server/src/risk.ts` owns server-side entry-risk decisions.
- `server/src/index.ts` exposes REST and live WebSocket state.

## Checks

```powershell
npm run check
```

This runs strict TypeScript checks for the Expo app and server plus automated tests for allowed/invalid transitions, stale revisions, idempotent replays, Emergency Exit, the equity floor, and core risk guards.

## Demo limitations

- Values are initialized locally and are explicitly simulated; there is no broker truth source.
- No trading strategy, signal logic, tick model, or automatic position generation exists.
- Watchlist switches configure monitoring presentation only.
- State is intentionally in memory. Restarting resets to a safe stopped demo rather than pretending to recover live execution.
- This is a development build, not a hardened production control plane.

## Production roadmap (gated)

```text
Android controller
  → authenticated HTTPS/WSS bridge on a VPS
  → MT5 terminal
  → signed/versioned MQL5 EA
  → Deriv demo account
  → independently reviewed live-activation gate
  → user's own Standard live account (only with explicit approval)
```

Before any live phase, add mutual authentication or short-lived tokens, TLS certificate validation, replay protection, authorization per device, encrypted audit logs, command reconciliation, watchdogs, reconnect recovery, an external kill switch, broker-state verification, and staged Deriv demo soak tests. Broker credentials should remain on the VPS/terminal side in OS-protected secret storage or a managed secrets vault; never store them in the Expo app, source code, `.env` committed to Git, logs, or mobile persistent storage.

Live activation must be a separate, explicit, reviewed release gate. No strategy can promise profit, and no statistical relationship should be called arbitrage unless its execution, costs, slippage, and failure modes justify that term.
