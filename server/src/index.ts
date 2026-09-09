import 'dotenv/config';
import { createServer } from 'node:http';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { ALL_SYMBOLS, type ControlAction, type SymbolName } from '../../src/types.js';
import { ControllerStore, TransitionError, log } from './stateMachine.js';
import { MarketProfiler } from './deriv/marketProfiler.js';
import { ExecutionEngine } from './strategy/executionEngine.js';
import { Mt5Bridge } from './mt5/mt5Bridge.js';
import { securityManager, requireAuth, rateLimiter, AuthError } from './auth/authMiddleware.js';
import { activationGateEngine } from './gates/activationGate.js';

const port       = Number(process.env.CONTROL_SERVER_PORT ?? 4000);
const host       = process.env.CONTROL_SERVER_HOST ?? '0.0.0.0';
const derivAppId = process.env.DERIV_APP_ID ?? '1089';  // public demo app_id
const derivToken = process.env.DERIV_API_TOKEN ?? null; // optional read-only token

const store           = new ControllerStore();
const mt5Bridge       = new Mt5Bridge(store);
const profiler        = new MarketProfiler(derivAppId, derivToken);
const executionEngine = new ExecutionEngine(store, mt5Bridge);

// Connect real-time tick stream to strategy execution engine
profiler.onTick((symbolCode, quote, epoch, ask, bid) => {
  executionEngine.handleTick(symbolCode, quote, epoch, ask, bid);
});

const app      = express();

app.use(cors());
app.use(express.json({ limit: '32kb' }));

// ─── Phase 5: Auth Endpoints ────────────────────────────────────────────────

/** Exchange VPS bridge API Key + Device ID for signed Bearer JWT */
app.post('/api/auth/token', rateLimiter(20), (req, res, next) => {
  try {
    const { apiKey, deviceId } = req.body as { apiKey?: string; deviceId?: string };
    if (!apiKey || !deviceId) {
      throw new AuthError('apiKey and deviceId are required.', 'INVALID_PARAMS', 400);
    }
    const tokenData = securityManager.issueToken(apiKey, deviceId);
    res.json(tokenData);
  } catch (error) { next(error); }
});

/** Register a new authorized device */
app.post('/api/auth/device/register', rateLimiter(10), (req, res, next) => {
  try {
    const { apiKey, deviceId, label } = req.body as { apiKey?: string; deviceId?: string; label?: string };
    if (!apiKey || !deviceId) {
      throw new AuthError('apiKey and deviceId are required.', 'INVALID_PARAMS', 400);
    }
    if (!securityManager.verifyApiKey(apiKey)) {
      throw new AuthError('Invalid API key for device registration.', 'INVALID_API_KEY', 403);
    }
    const device = securityManager.enrollDevice(deviceId, label);
    res.json({ ok: true, device });
  } catch (error) { next(error); }
});

/** List registered devices (requires auth) */
app.get('/api/auth/devices', requireAuth, (_req, res) => {
  res.json({ devices: securityManager.listDevices() });
});

// ─── Phase 6: Live Activation Gate Endpoints ────────────────────────────────

/** Full evaluation of all 5 non-negotiable gates */
app.get('/api/gates/status', (_req, res) => {
  res.json(activationGateEngine.evaluateGates());
});

/** Run on-demand Monte Carlo stress simulation */
app.post('/api/gates/simulate', (req, res) => {
  const { iterations = 1000, confidence = 0.95 } = req.body as { iterations?: number; confidence?: number };
  const mc = activationGateEngine.runMonteCarlo(activationGateEngine.getTrades(), iterations, confidence);
  res.json(mc);
});

/** Transition system from DEMO to LIVE mode (guarded by gates) */
app.post('/api/gates/activate-live', rateLimiter(10), (req, res, next) => {
  try {
    const { expectedRevision, requestId } = req.body as { expectedRevision?: number; requestId?: string };
    validateEnvelope(expectedRevision, requestId);

    const report = activationGateEngine.evaluateGates();
    const updatedState = store.activateLiveMode(
      expectedRevision as number,
      requestId as string,
      report.eligibleForLive
    );

    res.json({ ok: true, state: updatedState, report });
  } catch (error) { next(error); }
});

// ─── Controller endpoints ────────────────────────────────────────────────────

app.get('/health', (_req, res) =>
  res.json({ ok: true, mode: store.snapshot.mode, simulated: store.snapshot.mode === 'DEMO', instanceId: store.snapshot.serverInstanceId }),
);

app.get('/api/state', (_req, res) => res.json(store.snapshot));

app.post('/api/control', (req, res, next) => {
  try {
    const { action, expectedRevision, requestId } = req.body as {
      action?: ControlAction; expectedRevision?: number; requestId?: string;
    };
    if (!action || !['start', 'pause', 'resume', 'stop', 'emergencyExit'].includes(action))
      throw new TransitionError('Unknown control action.', 'INVALID_REQUEST');
    validateEnvelope(expectedRevision, requestId);
    if (action === 'emergencyExit') {
      mt5Bridge.triggerEmergencyFlatten();
    }
    res.json(store.control(action, expectedRevision as number, requestId as string));
  } catch (error) { next(error); }
});

app.put('/api/settings/symbols', (req, res, next) => {
  try {
    const { symbols, expectedRevision, requestId } = req.body as {
      symbols?: SymbolName[]; expectedRevision?: number; requestId?: string;
    };
    validateEnvelope(expectedRevision, requestId);
    if (!Array.isArray(symbols) || symbols.some((symbol) => !ALL_SYMBOLS.includes(symbol)))
      throw new TransitionError('Invalid symbols.', 'INVALID_REQUEST');
    res.json(store.setSymbols(symbols, expectedRevision as number, requestId as string));
  } catch (error) { next(error); }
});

// ─── Market Profiler endpoints ───────────────────────────────────────────────

/** Full profiler snapshot: Deriv connection status + all 10 symbol profiles. */
app.get('/api/profiler/status', (_req, res) => res.json(profiler.getState()));

/** Recent raw ticks for a symbol code, e.g. GET /api/profiler/ticks/R_75?n=200 */
app.get('/api/profiler/ticks/:code', (req, res) => {
  const n     = Math.min(Number(req.query['n'] ?? 200), 1_000);
  const ticks = profiler.getRecentTicks(req.params['code'] ?? '', n);
  res.json({ code: req.params['code'], count: ticks.length, ticks });
});

/** Force a fresh active_symbols fetch (useful to pick up newly opened symbols). */
app.post('/api/profiler/refresh', (_req, res, next) => {
  profiler.refreshActiveSymbols()
    .then(() => res.json({ ok: true }))
    .catch(next);
});

// ─── Strategy Engine (Phase 3) endpoints ────────────────────────────────────

/** Full strategy engine state: active signals, recent setups, and tracked pairs. */
app.get('/api/strategy/signals', (_req, res) => res.json(executionEngine.getState()));

/** Aggregated multi-timeframe candles for an instrument code. */
app.get('/api/strategy/candles/:code', (req, res) => {
  const n    = Math.min(Number(req.query['n'] ?? 50), 120);
  const code = req.params['code'] ?? '';
  res.json({ code, count: n, candles: executionEngine.getCandles(code, n) });
});

/** Live Smart Money Concepts (SMC) market structure telemetry and ATR for an instrument code. */
app.get('/api/strategy/structure/:code', (req, res) => {
  const code      = req.params['code'] ?? '';
  const candles   = executionEngine.getCandles(code, 40);
  const structure = executionEngine.getMarketStructure(code);
  const atr       = executionEngine.getAggregator().getATR(code);
  res.json({ code, atr, candles, structure });
});

// ─── MT5 Bridge (Phase 4) endpoints ─────────────────────────────────────────

/** Real-time telemetry ingestion from MT5 FalconEA */
app.post('/api/mt5/telemetry', (req, res) => {
  const status = mt5Bridge.handleTelemetry(req.body);
  res.json({ ok: true, status });
});

/** Poll pending execution commands for MT5 terminal */
app.get('/api/mt5/commands', (_req, res) => {
  const commands = mt5Bridge.pollCommands();
  res.json({ commands });
});

/** Ingest order execution result from MT5 terminal */
app.post('/api/mt5/order-result', (req, res) => {
  mt5Bridge.handleOrderResult(req.body);
  res.json({ ok: true });
});

/** Full MT5 bridge status (connection, telemetry, locks, open positions) */
app.get('/api/mt5/status', (_req, res) => {
  res.json(mt5Bridge.getStatus());
});

/** Manual emergency flatten kill switch */
app.post('/api/mt5/flatten', (_req, res) => {
  const command = mt5Bridge.triggerEmergencyFlatten();
  res.json({ ok: true, command });
});

/** Close specific MT5 position by ticket */
app.post('/api/mt5/positions/:ticket/close', (req, res) => {
  const ticket = Number(req.params.ticket);
  if (isNaN(ticket) || ticket <= 0) {
    res.status(400).json({ error: 'Invalid ticket number' });
    return;
  }
  const command = mt5Bridge.closePosition(ticket);
  res.json({ ok: true, command });
});

/** Generic close position endpoint (supports both MT5 live ticket and simulated position id) */
app.post('/api/positions/:id/close', (req, res) => {
  const id = req.params.id;
  const ticket = Number(id);
  if (!isNaN(ticket) && ticket > 0 && mt5Bridge.isConnected()) {
    const command = mt5Bridge.closePosition(ticket);
    res.json({ ok: true, command });
    return;
  }

  // Remove from store for paper simulated mode
  store.mutate((s) => {
    const pos = s.positions.find((p) => p.id === id);
    s.positions = s.positions.filter((p) => p.id !== id);
    s.marginUsagePercent = s.positions.length > 0 ? 5 : 0;
    if (pos) {
      log(s, 'info', `[MANUAL EXIT] Closed position ${pos.side} on ${pos.symbol} (#${id})`);
    }
  });
  res.json({ ok: true });
});

// ─── Error handler ───────────────────────────────────────────────────────────

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof AuthError) {
    res.status(error.statusCode).json({ error: error.message, code: error.code });
    return;
  }
  const known = error instanceof TransitionError;
  const status = known && error.code === 'REVISION_CONFLICT' ? 409 : (known && error.code === 'ACTIVATION_GATE_LOCKED' ? 403 : 400);
  res.status(status).json({
    error: error instanceof Error ? error.message : 'Unexpected error.',
    code:  known ? error.code : 'UNKNOWN',
    state: store.snapshot,
  });
});

// ─── HTTP + WebSocket ────────────────────────────────────────────────────────

const server  = createServer(app);
const sockets = new WebSocketServer({ server, path: '/ws' });

function broadcast(state: ReturnType<typeof getSnapshot>): void {
  const payload = JSON.stringify({ type: 'state', state });
  sockets.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) client.send(payload);
  });
}

function getSnapshot() { return store.snapshot; }
store.subscribe(broadcast);
sockets.on('connection', (socket) =>
  socket.send(JSON.stringify({ type: 'state', state: store.snapshot })),
);

const heartbeat = setInterval(() => store.heartbeat(), 5_000);

server.listen(port, host, () => {
  console.log(`DEMO mock control server: http://localhost:${port}`);
  console.log(`Health:   http://localhost:${port}/health`);
  console.log(`Profiler: http://localhost:${port}/api/profiler/status`);
  console.log('Listening on the LAN. No broker or MT5 connection present.');
  profiler.start().catch((err: unknown) =>
    console.warn('[MarketProfiler] Start error:', err instanceof Error ? err.message : err),
  );
});

function validateEnvelope(expectedRevision: unknown, requestId: unknown): void {
  if (
    !Number.isInteger(expectedRevision) ||
    typeof requestId !== 'string' ||
    requestId.length < 8 ||
    requestId.length > 100
  ) {
    throw new TransitionError('A valid expectedRevision and requestId are required.', 'INVALID_REQUEST');
  }
}

function shutdown(): void {
  clearInterval(heartbeat);
  profiler.stop();
  sockets.close();
  server.close(() => process.exit(0));
}
process.on('SIGINT',  shutdown);
process.on('SIGTERM', shutdown);
