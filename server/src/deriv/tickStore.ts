/** One tick as received from the Deriv WebSocket API. */
export interface TickSample {
  epoch: number;
  ask: number;
  bid: number;
  quote: number;
  /** ask - bid in price units. 0 when ask === bid (some synthetic indices). */
  spread: number;
}

export interface SpreadStats {
  min: number;
  max: number;
  median: number;
  /** 95th-percentile spread — used to model worst-case fill cost. */
  p95: number;
  count: number;
}

/** Maximum ticks retained per symbol. ~55 min at 1 tick/sec for V100(1s). */
const MAX_TICKS = 3_000;

export class TickStore {
  private store = new Map<string, TickSample[]>();

  push(symbol: string, tick: TickSample): void {
    let ticks = this.store.get(symbol);
    if (!ticks) {
      ticks = [];
      this.store.set(symbol, ticks);
    }
    ticks.push(tick);
    if (ticks.length > MAX_TICKS) ticks.shift();
  }

  recent(symbol: string, n = 200): TickSample[] {
    const ticks = this.store.get(symbol) ?? [];
    return ticks.slice(-n);
  }

  count(symbol: string): number {
    return this.store.get(symbol)?.length ?? 0;
  }

  /** Returns null until at least 10 ticks are collected. */
  spreadStats(symbol: string): SpreadStats | null {
    const ticks = this.store.get(symbol);
    if (!ticks || ticks.length < 10) return null;
    const spreads = ticks
      .map((t) => t.spread)
      .filter((s) => s >= 0)
      .sort((a, b) => a - b);
    if (spreads.length === 0) return null;
    const last = spreads.length - 1;
    return {
      min:    spreads[0]!,
      max:    spreads[last]!,
      median: spreads[Math.floor(last / 2)]!,
      p95:    spreads[Math.floor(last * 0.95)]!,
      count:  spreads.length,
    };
  }

  /**
   * Ticks per second, measured over the most recent 30 seconds of data.
   * Returns 0 if there is insufficient data.
   */
  tickVelocity(symbol: string): number {
    const ticks = this.store.get(symbol);
    if (!ticks || ticks.length < 2) return 0;
    const latest = ticks[ticks.length - 1]!.epoch;
    const windowStart = latest - 30;
    const window = ticks.filter((t) => t.epoch >= windowStart);
    if (window.length < 2) return 0;
    const duration = window[window.length - 1]!.epoch - window[0]!.epoch;
    return duration > 0 ? window.length / duration : 0;
  }
}
