import type { SymbolProfile, ProfilerApiState } from '../../../src/types.js';
import { DerivClient } from './derivClient.js';
import { TickStore } from './tickStore.js';
import { SYMBOL_MAP } from './symbolMap.js';

/** Active-symbol metadata received from Deriv API. */
interface ActiveInfo {
  pip:    number;
  spot:   number;
  isOpen: boolean;
}

/** Risk constants — mirror the demo risk config in stateMachine.ts */
const RISK_PER_TRADE_USD   = 0.10;
const EQUITY_FLOOR_USD     = 15.00;
const STARTING_BALANCE_USD = 20.00;
const MAX_AFFORDABLE_SPREAD_FRACTION = 0.005; // spread > 0.5% of spot = warning

export class MarketProfiler {
  private client:           DerivClient;
  private tickStore         = new TickStore();
  private activeInfo        = new Map<string, ActiveInfo>();
  private lastRefreshedAt:  string | null = null;
  private unsubscribers:    Array<() => void> = [];
  private refreshTimer:     ReturnType<typeof setInterval> | null = null;

  constructor(appId: string, token: string | null) {
    this.client = new DerivClient(appId, token);
  }

  /** Start the profiler: connect, fetch symbol list, subscribe to ticks. */
  async start(): Promise<void> {
    this.client.connect();

    // Wait up to 10 s for first connection
    await new Promise<void>((resolve) => {
      if (this.client.connected) { resolve(); return; }
      const unsub = this.client.onConnectionChange((c) => {
        if (c) { unsub(); resolve(); }
      });
      setTimeout(() => { resolve(); }, 10_000);
    });

    await this.refreshActiveSymbols();
    this.subscribeAllTicks();

    // Re-fetch symbol list every 5 minutes to pick up price / pip updates
    this.refreshTimer = setInterval(() => { void this.refreshActiveSymbols(); }, 5 * 60_000);
  }

  /** Fetch active_symbols from Deriv API and update the internal map. */
  async refreshActiveSymbols(): Promise<void> {
    if (!this.client.connected) return;
    try {
      const resp = await this.client.send({ active_symbols: 'brief', product_type: 'basic' });
      const list = resp['active_symbols'] as Array<{
        symbol:           string;
        display_name:     string;
        pip:              string;
        spot:             number;
        exchange_is_open: number;
      }> | undefined;

      if (Array.isArray(list) && list.length > 0) {
        this.activeInfo.clear();

        for (const item of list) {
          // Primary match: exact code
          if (SYMBOL_MAP.some((s) => s.code === item.symbol)) {
            this.activeInfo.set(item.symbol, {
              pip:    parseFloat(item.pip),
              spot:   item.spot,
              isOpen: item.exchange_is_open === 1,
            });
            continue;
          }

          // Fallback: match by display name keywords
          const normalized = item.display_name.toLowerCase();
          const matched = SYMBOL_MAP.find(
            (s) =>
              !this.activeInfo.has(s.code) &&
              normalized.includes(s.display.toLowerCase().replace(' index', '')),
          );
          if (matched) {
            this.activeInfo.set(item.symbol, {
              pip:    parseFloat(item.pip),
              spot:   item.spot,
              isOpen: item.exchange_is_open === 1,
            });
          }
        }

        console.log(
          `[MarketProfiler] Symbols refreshed via active_symbols — ${this.activeInfo.size}/${SYMBOL_MAP.length} found`,
        );
      } else {
        // active_symbols returned empty (happens with public app_id=1089).
        // Pre-seed from our known list so tick subscriptions can still gather data.
        // pip and spot will be updated from incoming ticks.
        console.log('[MarketProfiler] active_symbols returned 0 results — seeding from known list. Set DERIV_APP_ID in .env for full data.');
        for (const sym of SYMBOL_MAP) {
          if (!this.activeInfo.has(sym.code)) {
            this.activeInfo.set(sym.code, { pip: 0.01, spot: 0, isOpen: true });
          }
        }
      }

      this.lastRefreshedAt = new Date().toISOString();
    } catch (err) {
      console.warn(
        '[MarketProfiler] Failed to refresh active_symbols:',
        err instanceof Error ? err.message : err,
      );
      // On error, still seed so subscriptions can attempt ticks
      for (const sym of SYMBOL_MAP) {
        if (!this.activeInfo.has(sym.code)) {
          this.activeInfo.set(sym.code, { pip: 0.01, spot: 0, isOpen: true });
        }
      }
      this.lastRefreshedAt = new Date().toISOString();
    }
  }

  private subscribeAllTicks(): void {
    this.unsubscribers.forEach((u) => u());
    this.unsubscribers = [];

    for (const sym of SYMBOL_MAP) {
      const unsub = this.client.subscribeTicks(sym.code, (msg) => {
        const tick = msg['tick'] as {
          epoch:     number;
          ask?:      number;
          bid?:      number;
          quote:     number;
          pip_size?: number;
        } | undefined;
        if (!tick) return;

        const ask = tick.ask ?? tick.quote;
        const bid = tick.bid ?? tick.quote;

        // Update spot price from live tick (ensures profiler shows real price
        // even when active_symbols returned no data with the public app_id)
        const existing = this.activeInfo.get(sym.code);
        if (existing) {
          existing.spot   = tick.quote;
          existing.isOpen = true;
          if (tick.pip_size) existing.pip = Math.pow(10, -tick.pip_size);
        }

        this.tickStore.push(sym.code, {
          epoch:  tick.epoch,
          ask,
          bid,
          quote:  tick.quote,
          spread: ask - bid,
        });
      });
      this.unsubscribers.push(unsub);
    }
  }


  /** Build the full ProfilerApiState snapshot. Called by REST endpoints. */
  getState(): ProfilerApiState {
    const profiles: SymbolProfile[] = SYMBOL_MAP.map((sym): SymbolProfile => {
      const info         = this.activeInfo.get(sym.code);
      const spreadStats  = this.tickStore.spreadStats(sym.code);
      const tickVelocity = this.tickStore.tickVelocity(sym.code);
      const tickCount    = this.tickStore.count(sym.code);
      const lastTick     = this.tickStore.recent(sym.code, 1)[0];

      let affordable        = false;
      let affordabilityNote = 'Connecting to Deriv API…';

      if (!info) {
        affordabilityNote = 'Symbol not found on this server';
      } else if (!info.isOpen) {
        affordabilityNote = 'Market currently closed';
      } else if (tickCount === 0) {
        affordabilityNote = 'Subscribed — waiting for ticks';
      } else if (tickCount < 10) {
        affordabilityNote = `Collecting data… (${tickCount} ticks)`;
      } else if (spreadStats) {
        const spreadFraction = info.spot > 0 ? spreadStats.median / info.spot : 0;

        if (sym.group === 'step') {
          // Step Index: ±0.1 per tick, 50/50 — no directional edge documented
          affordable        = false;
          affordabilityNote =
            `Spread: ${spreadStats.median.toFixed(4)} · Step Index: ±0.1/tick, 50/50 — no edge confirmed`;
        } else if (spreadFraction > MAX_AFFORDABLE_SPREAD_FRACTION) {
          affordable        = false;
          affordabilityNote =
            `Wide spread: ${spreadStats.median.toFixed(info.pip < 0.01 ? 5 : 2)} (${(spreadFraction * 100).toFixed(3)}% of price) — verify lot costs`;
        } else {
          // Budget check: risk per trade must cover at least the spread + buffer
          // Without MT5 lot specs we flag based on spread fraction only
          affordable = true;
          affordabilityNote =
            `Spread: ${spreadStats.median.toFixed(info.pip < 0.01 ? 5 : 2)} pts · ${(spreadFraction * 100).toFixed(3)}% · ${spreadStats.count} samples`;
        }
      }

      return {
        code:                   sym.code,
        display:                sym.display,
        group:                  sym.group,
        available:              !!info,
        isOpen:                 info?.isOpen ?? false,
        pip:                    info?.pip ?? 0,
        spotPrice:              info?.spot ?? 0,
        spreadMedian:           spreadStats?.median ?? null,
        spreadP95:              spreadStats?.p95 ?? null,
        tickVelocity,
        tickCount,
        affordable,
        affordabilityNote,
        lastTickAt:             lastTick ? new Date(lastTick.epoch * 1000).toISOString() : null,
        riskConfig: {
          riskPerTradeUsd:   RISK_PER_TRADE_USD,
          equityFloorUsd:    EQUITY_FLOOR_USD,
          startingBalanceUsd: STARTING_BALANCE_USD,
        },
      };
    });

    return {
      connected:        this.client.connected,
      authorized:       this.client.authorized,
      profiles,
      lastRefreshedAt:  this.lastRefreshedAt,
    };
  }

  getRecentTicks(code: string, n = 200) {
    return this.tickStore.recent(code, n);
  }

  stop(): void {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    this.unsubscribers.forEach((u) => u());
    this.client.dispose();
  }
}
