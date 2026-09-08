import type { Candle } from '../../../src/types.js';

export interface SwingPoint {
  index: number;
  timestamp: number;
  price: number;
  type: 'HIGH' | 'LOW';
}

export interface FVGImbalance {
  type: 'BULLISH' | 'BEARISH';
  top: number;
  bottom: number;
  timestamp: number;
  mitigated: boolean;
}

export interface SMCStructureAnalysis {
  swingHighs: SwingPoint[];
  swingLows: SwingPoint[];
  lastBOS?: {
    type: 'BULLISH' | 'BEARISH';
    brokenPrice: number;
    candleTimestamp: number;
  };
  lastCHoCH?: {
    type: 'BULLISH' | 'BEARISH';
    brokenPrice: number;
    candleTimestamp: number;
  };
  activeFVGs: FVGImbalance[];
  trend: 'BULLISH' | 'BEARISH' | 'RANGING';
}

export class SMCDetector {
  /**
   * Analyzes an array of candles (oldest to newest) to detect market structure,
   * swing fractals, BOS, CHoCH, and active FVGs.
   */
  static analyze(candles: Candle[]): SMCStructureAnalysis {
    if (candles.length < 5) {
      return {
        swingHighs: [],
        swingLows: [],
        activeFVGs: [],
        trend: 'RANGING',
      };
    }

    const swingHighs: SwingPoint[] = [];
    const swingLows: SwingPoint[] = [];

    // 1. Detect 5-bar swing points
    for (let i = 2; i < candles.length - 2; i++) {
      const c = candles[i]!;
      const isHigh =
        c.high > candles[i - 1]!.high &&
        c.high > candles[i - 2]!.high &&
        c.high >= candles[i + 1]!.high &&
        c.high >= candles[i + 2]!.high;

      const isLow =
        c.low < candles[i - 1]!.low &&
        c.low < candles[i - 2]!.low &&
        c.low <= candles[i + 1]!.low &&
        c.low <= candles[i + 2]!.low;

      if (isHigh) {
        swingHighs.push({
          index: i,
          timestamp: c.timestamp,
          price: c.high,
          type: 'HIGH',
        });
      }
      if (isLow) {
        swingLows.push({
          index: i,
          timestamp: c.timestamp,
          price: c.low,
          type: 'LOW',
        });
      }
    }

    // 2. Detect Fair Value Gaps (FVG)
    const activeFVGs: FVGImbalance[] = [];
    for (let i = 2; i < candles.length; i++) {
      const c0 = candles[i - 2]!;
      const c2 = candles[i]!;

      // Bullish FVG: Gap between c0 high and c2 low
      if (c2.low > c0.high) {
        activeFVGs.push({
          type: 'BULLISH',
          top: c2.low,
          bottom: c0.high,
          timestamp: candles[i - 1]!.timestamp,
          mitigated: false,
        });
      }
      // Bearish FVG: Gap between c0 low and c2 high
      else if (c2.high < c0.low) {
        activeFVGs.push({
          type: 'BEARISH',
          top: c0.low,
          bottom: c2.high,
          timestamp: candles[i - 1]!.timestamp,
          mitigated: false,
        });
      }
    }

    // Check FVG mitigation against subsequent price action
    const latestClose = candles[candles.length - 1]!.close;
    const unmitigated = activeFVGs.filter((fvg) => {
      if (fvg.type === 'BULLISH' && latestClose < fvg.bottom) return false;
      if (fvg.type === 'BEARISH' && latestClose > fvg.top) return false;
      return true;
    });

    // 3. Detect Break of Structure (BOS) and Change of Character (CHoCH)
    let lastBOS: SMCStructureAnalysis['lastBOS'];
    let lastCHoCH: SMCStructureAnalysis['lastCHoCH'];
    let trend: SMCStructureAnalysis['trend'] = 'RANGING';

    const lastHigh = swingHighs[swingHighs.length - 1];
    const lastLow = swingLows[swingLows.length - 1];
    const prevHigh = swingHighs.length >= 2 ? swingHighs[swingHighs.length - 2] : undefined;
    const prevLow = swingLows.length >= 2 ? swingLows[swingLows.length - 2] : undefined;

    if (lastHigh && prevHigh) {
      if (lastHigh.price > prevHigh.price && lastLow && prevLow && lastLow.price > prevLow.price) {
        trend = 'BULLISH';
      } else if (lastHigh.price < prevHigh.price && lastLow && prevLow && lastLow.price < prevLow.price) {
        trend = 'BEARISH';
      }
    }

    const latest = candles[candles.length - 1]!;

    if (lastHigh && latest.close > lastHigh.price) {
      if (trend === 'BEARISH') {
        lastCHoCH = {
          type: 'BULLISH',
          brokenPrice: lastHigh.price,
          candleTimestamp: latest.timestamp,
        };
        trend = 'BULLISH';
      } else {
        lastBOS = {
          type: 'BULLISH',
          brokenPrice: lastHigh.price,
          candleTimestamp: latest.timestamp,
        };
      }
    } else if (lastLow && latest.close < lastLow.price) {
      if (trend === 'BULLISH') {
        lastCHoCH = {
          type: 'BEARISH',
          brokenPrice: lastLow.price,
          candleTimestamp: latest.timestamp,
        };
        trend = 'BEARISH';
      } else {
        lastBOS = {
          type: 'BEARISH',
          brokenPrice: lastLow.price,
          candleTimestamp: latest.timestamp,
        };
      }
    }

    return {
      swingHighs,
      swingLows,
      lastBOS,
      lastCHoCH,
      activeFVGs: unmitigated.slice(-5),
      trend,
    };
  }
}
