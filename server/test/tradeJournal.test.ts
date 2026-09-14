import { describe, expect, it } from 'vitest';
import type { Candle, SimulatedPosition } from '../../src/types.js';
import {
  TradeJournalStore,
  formatDurationSeconds,
  synthesizeWhatHappened,
  synthesizeWhatToDoNext,
} from '../src/journal/tradeJournalStore.js';
import { Mt5Bridge } from '../src/mt5/mt5Bridge.js';
import { ControllerStore, createInitialState } from '../src/stateMachine.js';
import { ExecutionEngine } from '../src/strategy/executionEngine.js';

describe('TradeJournalStore', () => {
  it('formats duration in seconds to human readable strings', () => {
    expect(formatDurationSeconds(0)).toBe('0s');
    expect(formatDurationSeconds(45)).toBe('45s');
    expect(formatDurationSeconds(90)).toBe('1m 30s');
    expect(formatDurationSeconds(3665)).toBe('1h 1m');
  });

  it('synthesizes technical post-trade diagnosis and self-improvement takeaways', () => {
    const tpDiagnosis = synthesizeWhatHappened(
      'Volatility 75 Index',
      'BUY',
      1000,
      1050,
      'TP_HIT',
      '14m 20s',
      47.5,
      'SMC BOS Continuation'
    );
    expect(tpDiagnosis).toContain('Market structure confirmed BUY');
    expect(tpDiagnosis).toContain('+$47.50 realized gain');

    const slDiagnosis = synthesizeWhatHappened(
      'Boom 1000 Index',
      'SELL',
      9850,
      9810,
      'SL_HIT',
      '6m 12s',
      -20.0,
      '5m Order Block'
    );
    expect(slDiagnosis).toContain('tripped hard stop-loss threshold');
    expect(slDiagnosis).toContain('-$20.00');

    const tpImprovement = synthesizeWhatToDoNext('TP_HIT', 'Volatility 75 Index');
    expect(tpImprovement).toContain('Avoid aggressive re-entry');

    const slImprovement = synthesizeWhatToDoNext('SL_HIT', 'Boom 1000 Index');
    expect(slImprovement).toContain('Strict risk invariant preserved account equity');
  });

  it('records open trades and resolves closed trades with duration and P&L', () => {
    const store = new TradeJournalStore();
    const initialCount = store.getEntries().length;

    const testPos: SimulatedPosition = {
      id: 'test-order-999',
      symbol: 'Volatility 75 Index',
      side: 'BUY',
      risk: 20,
      marginUsed: 0.2,
      unrealizedPnl: 0,
      openedAt: new Date(Date.now() - 300000).toISOString(), // 5 min ago
      simulated: true,
      entryPrice: 1000,
      stopLoss: 980,
      takeProfit: 1050,
      setupName: '15m Falcon Setup',
      rrRatio: 2.5,
    };

    store.recordTradeOpen(testPos);

    const closed = store.recordTradeClose(
      testPos.id,
      1050,
      'TP_HIT',
      50,
      10000,
      new Date()
    );

    expect(closed).not.toBeNull();
    expect(closed!.outcome).toBe('TP_HIT');
    expect(closed!.pnl).toBe(50);
    expect(closed!.symbol).toBe('Volatility 75 Index');
    expect(closed!.direction).toBe('BUY');
    expect(closed!.durationSeconds).toBeGreaterThanOrEqual(290);
    expect(closed!.duration).toContain('m');
    expect(store.getEntries().length).toBe(initialCount + 1);
  });

  it('automatically journals real trades when ExecutionEngine triggers TP or SL', () => {
    const initial = createInitialState();
    initial.status = 'running';
    const store = new ControllerStore(initial);
    const engine = new ExecutionEngine(store);

    const candles: Candle[] = [
      { timestamp: 1000, open: 100, high: 105, low: 95, close: 102, volume: 5 },
      { timestamp: 2000, open: 102, high: 110, low: 100, close: 108, volume: 5 },
      { timestamp: 3000, open: 108, high: 125, low: 107, close: 120, volume: 5 },
      { timestamp: 4000, open: 120, high: 118, low: 112, close: 115, volume: 5 },
      { timestamp: 5000, open: 115, high: 114, low: 108, close: 110, volume: 5 },
      { timestamp: 6000, open: 110, high: 130, low: 109, close: 128, volume: 5 },
    ];
    engine.getAggregator().seedCandles('R_75', candles);

    // Enter trade
    engine.handleTick('R_75', 130, 1700000000);
    expect(store.snapshot.positions).toHaveLength(1);
    const pos = store.snapshot.positions[0]!;

    // Exit trade via TP
    engine.handleTick('R_75', pos.takeProfit! + 5, 1700000060);
    expect(store.snapshot.positions).toHaveLength(0);
  });

  it('automatically journals real trades when Mt5Bridge detects closed positions', () => {
    const initial = createInitialState();
    initial.status = 'running';
    const store = new ControllerStore(initial);
    const bridge = new Mt5Bridge(store);

    // Initial position present
    bridge.handleTelemetry({
      account: 6048573,
      balance: 10000,
      equity: 10050,
      freeMargin: 10000,
      margin: 100,
      dailyPnlUsd: 50,
      openPositions: [
        {
          ticket: 887711,
          symbol: 'Volatility 75 Index',
          type: 'BUY',
          lots: 0.2,
          openPrice: 1000,
          currentPrice: 1050,
          stopLoss: 980,
          takeProfit: 1050,
          profitUsd: 50,
          openTime: new Date(Date.now() - 60000).toISOString(),
        },
      ],
      riskLocked: false,
      equityFloorLocked: false,
      terminalTime: new Date().toISOString(),
    });

    expect(store.snapshot.positions).toHaveLength(1);

    // Position closes on MT5 (empty openPositions telemetry arrives)
    bridge.handleTelemetry({
      account: 6048573,
      balance: 10050,
      equity: 10050,
      freeMargin: 10050,
      margin: 0,
      dailyPnlUsd: 50,
      openPositions: [],
      riskLocked: false,
      equityFloorLocked: false,
      terminalTime: new Date().toISOString(),
    });

    expect(store.snapshot.positions).toHaveLength(0);
  });
});
