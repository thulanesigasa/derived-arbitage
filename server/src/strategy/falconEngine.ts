import { randomUUID } from 'node:crypto';
import type { Candle, StrategySignal, SymbolName } from '../../../src/types.js';
import { SMCDetector } from './smcDetector.js';

export class FalconEngine {
  /** Minimum Risk-to-Reward ratio strictly enforced across all setups */
  static readonly MIN_RR = 2.5;
  /** Fixed personal risk per simulated trade */
  static readonly RISK_USD = 0.10;

  /**
   * Evaluates candles, ATR, and spot price to detect qualifying SMC & Falcon FX setups.
   * Returns a valid StrategySignal if all confluence rules match, or null otherwise.
   */
  static evaluate(
    symbol: SymbolName,
    symbolCode: string,
    candles: Candle[],
    atr: number,
    spotPrice: number
  ): StrategySignal | null {
    if (candles.length < 6 || spotPrice <= 0 || atr <= 0) return null;

    const smc = SMCDetector.analyze(candles);
    const latest = candles[candles.length - 1]!;
    const prev = candles[candles.length - 2]!;

    // ─── Setup 1: Falcon Liquidity Sweep Reversal ────────────────────────────
    // Wick sweeps recent swing point but closes back inside range
    const recentHigh = smc.swingHighs[smc.swingHighs.length - 1];
    const recentLow = smc.swingLows[smc.swingLows.length - 1];

    if (recentHigh && latest.high > recentHigh.price && latest.close < recentHigh.price) {
      // Bearish sweep of buy-side liquidity
      const slDistance = Math.max(latest.high - spotPrice + (atr * 0.5), atr * 1.5);
      const sl = spotPrice + slDistance;
      const tp = spotPrice - (slDistance * this.MIN_RR);

      return {
        id: randomUUID(),
        symbol,
        symbolCode,
        side: 'SELL',
        setupName: 'FALCON_LIQUIDITY_SWEEP',
        entryPrice: spotPrice,
        stopLoss: sl,
        takeProfit: tp,
        riskUsd: this.RISK_USD,
        rrRatio: this.MIN_RR,
        confidence: 0.90,
        createdAt: new Date().toISOString(),
      };
    }

    if (recentLow && latest.low < recentLow.price && latest.close > recentLow.price) {
      // Bullish sweep of sell-side liquidity
      const slDistance = Math.max(spotPrice - latest.low + (atr * 0.5), atr * 1.5);
      const sl = spotPrice - slDistance;
      const tp = spotPrice + (slDistance * this.MIN_RR);

      return {
        id: randomUUID(),
        symbol,
        symbolCode,
        side: 'BUY',
        setupName: 'FALCON_LIQUIDITY_SWEEP',
        entryPrice: spotPrice,
        stopLoss: sl,
        takeProfit: tp,
        riskUsd: this.RISK_USD,
        rrRatio: this.MIN_RR,
        confidence: 0.90,
        createdAt: new Date().toISOString(),
      };
    }

    // ─── Setup 2: SMC Change of Character (CHoCH) Trend Reversal ─────────────
    if (smc.lastCHoCH) {
      const isBullish = smc.lastCHoCH.type === 'BULLISH';
      const slDistance = atr * 1.5;
      const sl = isBullish ? spotPrice - slDistance : spotPrice + slDistance;
      const tp = isBullish ? spotPrice + (slDistance * this.MIN_RR) : spotPrice - (slDistance * this.MIN_RR);

      return {
        id: randomUUID(),
        symbol,
        symbolCode,
        side: isBullish ? 'BUY' : 'SELL',
        setupName: 'SMC_CHOCH_REVERSAL',
        entryPrice: spotPrice,
        stopLoss: sl,
        takeProfit: tp,
        riskUsd: this.RISK_USD,
        rrRatio: this.MIN_RR,
        confidence: 0.85,
        createdAt: new Date().toISOString(),
      };
    }

    // ─── Setup 3: SMC Break of Structure (BOS) Continuation ──────────────────
    if (smc.lastBOS) {
      const isBullish = smc.lastBOS.type === 'BULLISH';
      const slDistance = atr * 1.5;
      const sl = isBullish ? spotPrice - slDistance : spotPrice + slDistance;
      const tp = isBullish ? spotPrice + (slDistance * this.MIN_RR) : spotPrice - (slDistance * this.MIN_RR);

      return {
        id: randomUUID(),
        symbol,
        symbolCode,
        side: isBullish ? 'BUY' : 'SELL',
        setupName: 'SMC_BOS_CONTINUATION',
        entryPrice: spotPrice,
        stopLoss: sl,
        takeProfit: tp,
        riskUsd: this.RISK_USD,
        rrRatio: this.MIN_RR,
        confidence: 0.80,
        createdAt: new Date().toISOString(),
      };
    }

    // ─── Setup 4: Fair Value Gap (FVG) Retest ────────────────────────────────
    if (smc.activeFVGs.length > 0) {
      const fvg = smc.activeFVGs[smc.activeFVGs.length - 1]!;
      if (fvg.type === 'BULLISH' && spotPrice >= fvg.bottom && spotPrice <= fvg.top) {
        const slDistance = Math.max(spotPrice - fvg.bottom + (atr * 0.5), atr * 1.2);
        const sl = spotPrice - slDistance;
        const tp = spotPrice + (slDistance * this.MIN_RR);

        return {
          id: randomUUID(),
          symbol,
          symbolCode,
          side: 'BUY',
          setupName: 'SMC_FVG_RETEST',
          entryPrice: spotPrice,
          stopLoss: sl,
          takeProfit: tp,
          riskUsd: this.RISK_USD,
          rrRatio: this.MIN_RR,
          confidence: 0.82,
          createdAt: new Date().toISOString(),
        };
      } else if (fvg.type === 'BEARISH' && spotPrice <= fvg.top && spotPrice >= fvg.bottom) {
        const slDistance = Math.max(fvg.top - spotPrice + (atr * 0.5), atr * 1.2);
        const sl = spotPrice + slDistance;
        const tp = spotPrice - (slDistance * this.MIN_RR);

        return {
          id: randomUUID(),
          symbol,
          symbolCode,
          side: 'SELL',
          setupName: 'SMC_FVG_RETEST',
          entryPrice: spotPrice,
          stopLoss: sl,
          takeProfit: tp,
          riskUsd: this.RISK_USD,
          rrRatio: this.MIN_RR,
          confidence: 0.82,
          createdAt: new Date().toISOString(),
        };
      }
    }

    return null;
  }
}
