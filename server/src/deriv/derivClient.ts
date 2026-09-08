import WebSocket from 'ws';

type JsonObject = Record<string, unknown>;
type TickHandler = (msg: JsonObject) => void;

interface Pending {
  resolve: (value: JsonObject) => void;
  reject:  (reason: Error) => void;
  timer:   ReturnType<typeof setTimeout>;
}

/**
 * Authenticated Deriv WebSocket client.
 *
 * - Correlates request/response pairs via req_id.
 * - Automatically re-subscribes tick streams after reconnect.
 * - Exponential backoff on disconnect (max 30 s).
 * - Token is optional; unauthenticated sessions still receive tick data.
 */
export class DerivClient {
  private ws:              WebSocket | null = null;
  private reqCounter       = 1;
  private pending          = new Map<number, Pending>();
  private tickSubs         = new Map<string, TickHandler>(); // key: symbol code
  private reconnectTimer:  ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay   = 2_000;
  private disposed         = false;
  private _connected       = false;
  private _authorized      = false;
  private connListeners    = new Set<(c: boolean) => void>();

  constructor(
    private readonly appId: string,
    private readonly token: string | null,
    private readonly wsUrl = appId && appId !== '1089'
      ? `wss://ws.derivws.com/websockets/v3?app_id=${appId}`
      : 'wss://api.derivws.com/trading/v1/options/ws/public',
  ) {}

  get connected()  { return this._connected; }
  get authorized() { return this._authorized; }

  /** Register a listener that fires whenever the connection state changes. */
  onConnectionChange(listener: (connected: boolean) => void): () => void {
    this.connListeners.add(listener);
    return () => this.connListeners.delete(listener);
  }

  connect(): void {
    if (this.disposed) return;
    if (this.ws?.readyState === WebSocket.OPEN) return;

    console.log(`[DerivClient] Connecting → ${this.wsUrl}`);
    this.ws = new WebSocket(this.wsUrl);
    this.ws.on('open',    ()  => { void this.handleOpen(); });
    this.ws.on('message', (d) => { this.handleMessage(d.toString()); });
    this.ws.on('error',   (e) => { console.error('[DerivClient] Error:', e.message); });
    this.ws.on('close',   ()  => { this.handleClose(); });
  }

  private async handleOpen(): Promise<void> {
    this.reconnectDelay = 2_000;
    this._connected = true;
    this.connListeners.forEach((l) => l(true));
    console.log('[DerivClient] Connected');

    // Only send authorize on v3 WebSocket endpoints with non-PAT tokens
    if (this.token && !this.token.startsWith('pat_') && !this.wsUrl.includes('/ws/public')) {
      try {
        const resp = await this.send({ authorize: this.token });
        if (resp['error']) throw new Error((resp['error'] as { message: string }).message);
        this._authorized = true;
        console.log('[DerivClient] Authorized as:', (resp['authorize'] as { loginid?: string })?.loginid ?? '?');
      } catch (err) {
        console.warn('[DerivClient] Auth warning:', err instanceof Error ? err.message : err);
        this._authorized = false;
      }
    } else if (this.token && this.token.startsWith('pat_')) {
      console.log('[DerivClient] Options PAT active for market profiling');
      this._authorized = true;
    }

    // Re-establish tick subscriptions
    for (const symbol of this.tickSubs.keys()) {
      this.sendRaw({ ticks: symbol, subscribe: 1 }).catch(() => {});
    }
  }

  private handleClose(): void {
    this._connected  = false;
    this._authorized = false;
    this.connListeners.forEach((l) => l(false));

    // Reject all in-flight requests
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(new Error('DerivClient: WebSocket closed'));
    }
    this.pending.clear();

    if (this.disposed) return;
    console.log(`[DerivClient] Disconnected — reconnecting in ${this.reconnectDelay}ms`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectDelay = Math.min(this.reconnectDelay * 1.5, 30_000);
      this.connect();
    }, this.reconnectDelay);
  }

  private handleMessage(raw: string): void {
    let msg: JsonObject;
    try { msg = JSON.parse(raw) as JsonObject; }
    catch { return; }

    // Correlate one-shot requests
    const reqId = msg['req_id'] as number | undefined;
    if (reqId !== undefined && this.pending.has(reqId)) {
      const p = this.pending.get(reqId)!;
      clearTimeout(p.timer);
      this.pending.delete(reqId);
      if (msg['error']) {
        p.reject(new Error((msg['error'] as { message?: string }).message ?? 'Deriv error'));
      } else {
        p.resolve(msg);
      }
      return;
    }

    // Route streaming tick messages
    if (msg['msg_type'] === 'tick') {
      const tick = msg['tick'] as { symbol?: string } | undefined;
      if (tick?.symbol) {
        this.tickSubs.get(tick.symbol)?.(msg);
      }
    }
  }

  /** Send a request and await a correlated response. Rejects after timeoutMs. */
  send(payload: JsonObject, timeoutMs = 12_000): Promise<JsonObject> {
    return new Promise((resolve, reject) => {
      const reqId = this.reqCounter++;
      const timer = setTimeout(() => {
        this.pending.delete(reqId);
        reject(new Error(`DerivClient: request timed out (req_id=${reqId})`));
      }, timeoutMs);
      this.pending.set(reqId, { resolve, reject, timer });
      this.sendRaw({ ...payload, req_id: reqId }).catch((err: unknown) => {
        clearTimeout(timer);
        this.pending.delete(reqId);
        reject(err instanceof Error ? err : new Error(String(err)));
      });
    });
  }

  private sendRaw(payload: JsonObject): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('DerivClient: not connected'));
        return;
      }
      this.ws.send(JSON.stringify(payload), (err) => {
        if (err) reject(err); else resolve();
      });
    });
  }

  /** Subscribe to live ticks for a symbol. Returns an unsubscribe function. */
  subscribeTicks(symbol: string, handler: TickHandler): () => void {
    this.tickSubs.set(symbol, handler);
    if (this._connected) {
      this.sendRaw({ ticks: symbol, subscribe: 1 }).catch(() => {});
    }
    return () => {
      this.tickSubs.delete(symbol);
      if (this._connected) {
        this.sendRaw({ forget_all: 'ticks' }).catch(() => {});
      }
    };
  }

  dispose(): void {
    this.disposed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    for (const [, p] of this.pending) { clearTimeout(p.timer); p.reject(new Error('DerivClient disposed')); }
    this.pending.clear();
    this.tickSubs.clear();
    this.ws?.close();
  }
}
