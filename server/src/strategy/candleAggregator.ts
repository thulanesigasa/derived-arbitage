import type { Candle } from '../../../src/types.js';

export interface TickInput {
  epoch: number; // seconds
  quote: number;
  bid?: number;
  ask?: number;
}

const MAX_CANDLES = 150;
const DEFAULT_ATR_PERIOD = 14;

export class CandleAggregator {
  /** Map of symbolCode -> Candle[] (sorted oldest to newest) */
  private candles = new Map<string, Candle[]>();
  /** Current in-progress candle per symbol */
  private currentCandle = new Map<string, Candle>();
  /** Bar duration in seconds (default 60 = 1 minute) */
  private readonly timeframeSec: number;

  constructor(timeframeSec = 60) {
    this.timeframeSec = timeframeSec;
  }

  /**
   * Ingests a new tick and updates the current candle or finalizes it and begins a new one.
   * Returns true if a candle was finalized on this tick.
   */
  pushTick(symbolCode: string, tick: TickInput): boolean {
    const barTimestampMs = Math.floor(tick.epoch / this.timeframeSec) * this.timeframeSec * 1000;
    const current = this.currentCandle.get(symbolCode);

    if (!current) {
      this.currentCandle.set(symbolCode, {
        timestamp: barTimestampMs,
        open:      tick.quote,
        high:      tick.quote,
        low:       tick.quote,
        close:     tick.quote,
        volume:    1,
      });
      return false;
    }

    if (current.timestamp === barTimestampMs) {
      // Update in-progress candle
      current.high = Math.max(current.high, tick.quote);
      current.low  = Math.min(current.low, tick.quote);
      current.close = tick.quote;
      current.volume += 1;
      return false;
    }

    if (barTimestampMs > current.timestamp) {
      // Finalize completed candle
      let history = this.candles.get(symbolCode);
      if (!history) {
        history = [];
        this.candles.set(symbolCode, history);
      }
      history.push({ ...current });
      if (history.length > MAX_CANDLES) history.shift();

      // Start new candle
      this.currentCandle.set(symbolCode, {
        timestamp: barTimestampMs,
        open:      tick.quote,
        high:      tick.quote,
        low:       tick.quote,
        close:     tick.quote,
        volume:    1,
      });
      return true;
    }

    // Out of order tick ignored
    return false;
  }

  /**
   * Returns completed candles plus the currently active forming candle.
   */
  getCandles(symbolCode: string, limit = 50): Candle[] {
    const history = this.candles.get(symbolCode) ?? [];
    const current = this.currentCandle.get(symbolCode);
    const combined = current ? [...history, { ...current }] : [...history];
    return combined.slice(-limit);
  }

  /**
   * Injects completed candles (used for initial warm-up or testing).
   */
  seedCandles(symbolCode: string, candles: Candle[]): void {
    const history = this.candles.get(symbolCode) ?? [];
    history.push(...candles);
    if (history.length > MAX_CANDLES) {
      this.candles.set(symbolCode, history.slice(-MAX_CANDLES));
    } else {
      this.candles.set(symbolCode, history);
    }
  }

  /**
   * Calculates dynamic Average True Range (ATR) over N periods.
   */
  getATR(symbolCode: string, period = DEFAULT_ATR_PERIOD): number {
    const candles = this.getCandles(symbolCode, period + 2);
    if (candles.length < 2) {
      const latest = candles[0];
      return latest ? Math.max(latest.close * 0.002, 0.01) : 0.01;
    }

    let trSum = 0;
    const count = Math.min(candles.length - 1, period);
    const startIndex = candles.length - count;

    for (let i = startIndex; i < candles.length; i++) {
      const curr = candles[i]!;
      const prev = candles[i - 1]!;
      const tr = Math.max(
        curr.high - curr.low,
        Math.abs(curr.high - prev.close),
        Math.abs(curr.low - prev.close)
      );
      trSum += tr;
    }

    return Math.max(trSum / count, 0.0001);
  }
}
