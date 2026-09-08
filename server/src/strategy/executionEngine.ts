import type {
  Candle,
  ControllerState,
  SimulatedPosition,
  StrategyApiState,
  StrategySignal,
  SymbolName,
} from '../../../src/types.js';
import { SYMBOL_MAP } from '../deriv/symbolMap.js';
import { assessNewTrade } from '../risk.js';
import { ControllerStore, log } from '../stateMachine.js';
import { CandleAggregator } from './candleAggregator.js';
import { FalconEngine } from './falconEngine.js';
import { SMCDetector, type SMCStructureAnalysis } from './smcDetector.js';

export class ExecutionEngine {
  private store: ControllerStore;
  private aggregator = new CandleAggregator(60); // 1-minute bars
  private recentSignals: StrategySignal[] = [];
  private lastEntryTime = 0;
  /** Cooldown in ms between trades to prevent immediate duplicate executions */
  private readonly entryCooldownMs = 15_000;

  constructor(store: ControllerStore) {
    this.store = store;
  }

  getAggregator(): CandleAggregator {
    return this.aggregator;
  }

  getCandles(symbolCode: string, limit = 50): Candle[] {
    return this.aggregator.getCandles(symbolCode, limit);
  }

  getMarketStructure(symbolCode: string): SMCStructureAnalysis {
    const candles = this.aggregator.getCandles(symbolCode, 50);
    return SMCDetector.analyze(candles);
  }

  getRecentSignals(): StrategySignal[] {
    return [...this.recentSignals];
  }

  getState(): StrategyApiState {
    const state = this.store.snapshot;
    return {
      enabled: state.status === 'running',
      activeSignals: this.recentSignals.filter((s) =>
        state.positions.some((p) => p.symbol === s.symbol)
      ),
      recentSignals: this.recentSignals.slice(0, 10),
      trackedPairs: state.selectedSymbols.length,
    };
  }

  /**
   * Evaluates each live tick received from Deriv WebSocket feed.
   */
  handleTick(symbolCode: string, quote: number, epoch: number, ask?: number, bid?: number): void {
    if (quote <= 0) return;

    // 1. Ingest tick into Candle Aggregator
    this.aggregator.pushTick(symbolCode, { epoch, quote, ask, bid });

    const sym = SYMBOL_MAP.find((s) => s.code === symbolCode);
    if (!sym) return;

    const state = this.store.snapshot;

    // 2. Manage open position exits & unrealized P&L regardless of whether paused or running
    const existingIndex = state.positions.findIndex((p) => p.symbol === sym.display);
    if (existingIndex !== -1) {
      this.evaluatePositionExit(sym.display, quote, existingIndex);
      return;
    }

    // 3. Evaluate new entries ONLY when automation is running
    if (state.status !== 'running') return;
    if (!state.selectedSymbols.includes(sym.display)) return;
    if (state.positions.length >= state.riskPolicy.maxOpenPositions) return;

    const now = Date.now();
    if (now - this.lastEntryTime < this.entryCooldownMs) return;

    const candles = this.aggregator.getCandles(symbolCode, 30);
    const atr = this.aggregator.getATR(symbolCode);

    const signal = FalconEngine.evaluate(sym.display, sym.code, candles, atr, quote);
    if (!signal) return;

    // 4. Pre-trade Risk Gate Validation
    const decision = assessNewTrade(state, { risk: signal.riskUsd, marginUsagePercent: 5 });
    if (!decision.allowed) {
      this.store.mutate((s) => {
        log(s, 'warning', `[SMC RISK] Trade rejected on ${sym.display}: ${decision.reasons.join(' ')}`);
      });
      return;
    }

    // 5. Open Simulated Position
    const position: SimulatedPosition = {
      id: signal.id,
      symbol: signal.symbol,
      side: signal.side,
      risk: signal.riskUsd,
      marginUsed: 1.0,
      unrealizedPnl: 0,
      openedAt: new Date().toISOString(),
      simulated: true,
      entryPrice: signal.entryPrice,
      stopLoss: signal.stopLoss,
      takeProfit: signal.takeProfit,
      setupName: signal.setupName,
      rrRatio: signal.rrRatio,
    };

    this.lastEntryTime = now;
    this.recentSignals.unshift(signal);
    if (this.recentSignals.length > 30) this.recentSignals.pop();

    this.store.mutate((s) => {
      s.positions = [...s.positions, position];
      s.marginUsagePercent = 5;
      log(
        s,
        'info',
        `[SMC ENGINE] Opened ${signal.side} on ${signal.symbol} @ ${signal.entryPrice.toFixed(2)} · SL: ${signal.stopLoss.toFixed(2)} · TP: ${signal.takeProfit.toFixed(2)} · Target: 1:${signal.rrRatio} R:R`
      );
    });
  }

  /**
   * Real-time position tracking and TP/SL automated exit processing.
   */
  private evaluatePositionExit(symbol: SymbolName, currentPrice: number, posIndex: number): void {
    this.store.mutate((s) => {
      const pos = s.positions[posIndex];
      if (!pos || !pos.entryPrice || !pos.stopLoss || !pos.takeProfit) return;

      const slDistance = Math.abs(pos.entryPrice - pos.stopLoss);
      if (slDistance <= 0) return;

      const isBuy = pos.side === 'BUY';
      const priceDelta = (currentPrice - pos.entryPrice) * (isBuy ? 1 : -1);

      // Check Take Profit Reached
      const tpHit = isBuy ? currentPrice >= pos.takeProfit : currentPrice <= pos.takeProfit;
      if (tpHit) {
        const gain = Math.round(pos.risk * (pos.rrRatio ?? 2.5) * 100) / 100;
        s.positions = s.positions.filter((p) => p.id !== pos.id);
        s.balance = Math.round((s.balance + gain) * 100) / 100;
        s.sessionPnl = Math.round((s.sessionPnl + gain) * 100) / 100;
        s.dailyPnl = Math.round((s.dailyPnl + gain) * 100) / 100;
        s.marginUsagePercent = s.positions.length > 0 ? 5 : 0;
        s.equity = s.balance;
        log(
          s,
          'success',
          `[TP HIT] Target reached on ${pos.symbol} @ ${currentPrice.toFixed(2)} · Realized +$${gain.toFixed(2)} (1:${pos.rrRatio ?? 2.5} R:R)`
        );
        return;
      }

      // Check Stop Loss Reached
      const slHit = isBuy ? currentPrice <= pos.stopLoss : currentPrice >= pos.stopLoss;
      if (slHit) {
        const loss = pos.risk;
        s.positions = s.positions.filter((p) => p.id !== pos.id);
        s.balance = Math.round((s.balance - loss) * 100) / 100;
        s.sessionPnl = Math.round((s.sessionPnl - loss) * 100) / 100;
        s.dailyPnl = Math.round((s.dailyPnl - loss) * 100) / 100;
        s.drawdown = Math.round(Math.max(s.drawdown, s.riskPolicy.initialBalance - s.balance) * 100) / 100;
        s.marginUsagePercent = s.positions.length > 0 ? 5 : 0;
        s.equity = s.balance;
        log(
          s,
          'warning',
          `[SL HIT] Stopped out on ${pos.symbol} @ ${currentPrice.toFixed(2)} · Loss -$${loss.toFixed(2)}`
        );
        return;
      }

      // Active position unrealized P&L update
      const normalizedPnl = Math.round(((priceDelta / slDistance) * pos.risk) * 100) / 100;
      pos.unrealizedPnl = normalizedPnl;
      const totalUnrealized = s.positions.reduce((acc, p) => acc + p.unrealizedPnl, 0);
      s.equity = Math.round((s.balance + totalUnrealized) * 100) / 100;
    });
  }
}
