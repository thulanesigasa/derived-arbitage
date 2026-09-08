import 'dotenv/config';
import { createServer } from 'node:http';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { ALL_SYMBOLS, type ControlAction, type SymbolName } from '../../src/types.js';
import { ControllerStore, TransitionError } from './stateMachine.js';
import { MarketProfiler } from './deriv/marketProfiler.js';
import { ExecutionEngine } from './strategy/executionEngine.js';

const port       = Number(process.env.CONTROL_SERVER_PORT ?? 4000);
const host       = process.env.CONTROL_SERVER_HOST ?? '0.0.0.0';
const derivAppId = process.env.DERIV_APP_ID ?? '1089';  // public demo app_id
const derivToken = process.env.DERIV_API_TOKEN ?? null; // optional read-only token

const store           = new ControllerStore();
const profiler        = new MarketProfiler(derivAppId, derivToken);
const executionEngine = new ExecutionEngine(store);

// Connect real-time tick stream to strategy execution engine
profiler.onTick((symbolCode, quote, epoch, ask, bid) => {
  executionEngine.handleTick(symbolCode, quote, epoch, ask, bid);
});

const app      = express();

app.use(cors());
app.use(express.json({ limit: '32kb' }));

// ─── Controller endpoints ────────────────────────────────────────────────────

app.get('/health', (_req, res) =>
  res.json({ ok: true, mode: 'DEMO', simulated: true, instanceId: store.snapshot.serverInstanceId }),
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

// ─── Error handler ───────────────────────────────────────────────────────────

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const known = error instanceof TransitionError;
  res.status(known && error.code === 'REVISION_CONFLICT' ? 409 : 400).json({
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
