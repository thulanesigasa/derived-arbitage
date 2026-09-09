import { describe, expect, it } from 'vitest';
import type { Candle } from '../../src/types.js';
import { Mt5Bridge } from '../src/mt5/mt5Bridge.js';
import { ControllerStore, createInitialState } from '../src/stateMachine.js';
import { CandleAggregator } from '../src/strategy/candleAggregator.js';
import { ExecutionEngine } from '../src/strategy/executionEngine.js';
import { FalconEngine } from '../src/strategy/falconEngine.js';
import { SMCDetector } from '../src/strategy/smcDetector.js';

describe('CandleAggregator', () => {
  it('aggregates ticks in the same minute into a single candle', () => {
    const agg = new CandleAggregator(60);
    const t0 = Math.floor(1700000000 / 60) * 60;

    agg.pushTick('R_75', { epoch: t0 + 1, quote: 100 });
    agg.pushTick('R_75', { epoch: t0 + 10, quote: 105 });
    agg.pushTick('R_75', { epoch: t0 + 20, quote: 95 });
    agg.pushTick('R_75', { epoch: t0 + 50, quote: 102 });

    const candles = agg.getCandles('R_75');
    expect(candles).toHaveLength(1);
    expect(candles[0]!.open).toBe(100);
    expect(candles[0]!.high).toBe(105);
    expect(candles[0]!.low).toBe(95);
    expect(candles[0]!.close).toBe(102);
    expect(candles[0]!.volume).toBe(4);
  });

  it('finalizes previous candle when new minute starts', () => {
    const agg = new CandleAggregator(60);
    const t0 = Math.floor(1700000000 / 60) * 60;

    agg.pushTick('R_100', { epoch: t0, quote: 500 });
    agg.pushTick('R_100', { epoch: t0 + 30, quote: 510 });
    // Next minute
    const finalized = agg.pushTick('R_100', { epoch: t0 + 65, quote: 508 });

    expect(finalized).toBe(true);
    const candles = agg.getCandles('R_100');
    expect(candles).toHaveLength(2);
    expect(candles[0]!.close).toBe(510);
    expect(candles[1]!.open).toBe(508);
  });

  it('computes rolling ATR', () => {
    const agg = new CandleAggregator(60);
    const candles: Candle[] = [
      { timestamp: 1000, open: 100, high: 110, low: 95, close: 105, volume: 10 },
      { timestamp: 2000, open: 105, high: 115, low: 102, close: 112, volume: 10 },
      { timestamp: 3000, open: 112, high: 120, low: 108, close: 118, volume: 10 },
    ];
    agg.seedCandles('R_75', candles);
    const atr = agg.getATR('R_75', 2);
    expect(atr).toBeGreaterThan(0);
  });
});

describe('SMCDetector', () => {
  it('detects 5-bar swing fractals and fair value gaps', () => {
    const candles: Candle[] = [
      { timestamp: 1000, open: 100, high: 102, low: 98, close: 101, volume: 5 },
      { timestamp: 2000, open: 101, high: 106, low: 100, close: 105, volume: 5 },
      // Swing High peak
      { timestamp: 3000, open: 105, high: 120, low: 104, close: 118, volume: 5 },
      { timestamp: 4000, open: 118, high: 116, low: 110, close: 112, volume: 5 },
      { timestamp: 5000, open: 112, high: 111, low: 105, close: 108, volume: 5 },
      // Bullish FVG candle sequence: c4.low > c2.high
      { timestamp: 6000, open: 108, high: 135, low: 125, close: 132, volume: 5 },
    ];

    const smc = SMCDetector.analyze(candles);
    expect(smc.swingHighs.length).toBeGreaterThan(0);
    const high = smc.swingHighs.find((h) => h.price === 120);
    expect(high).toBeDefined();
    expect(high?.type).toBe('HIGH');
  });

  it('detects Break of Structure (BOS)', () => {
    const candles: Candle[] = [
      { timestamp: 1000, open: 100, high: 105, low: 95, close: 102, volume: 5 },
      { timestamp: 2000, open: 102, high: 110, low: 100, close: 108, volume: 5 },
      { timestamp: 3000, open: 108, high: 125, low: 107, close: 120, volume: 5 },
      { timestamp: 4000, open: 120, high: 118, low: 112, close: 115, volume: 5 },
      { timestamp: 5000, open: 115, high: 114, low: 108, close: 110, volume: 5 },
      // Break above swing high 125
      { timestamp: 6000, open: 110, high: 130, low: 109, close: 128, volume: 5 },
    ];

    const smc = SMCDetector.analyze(candles);
    expect(smc.lastBOS).toBeDefined();
    expect(smc.lastBOS?.type).toBe('BULLISH');
    expect(smc.lastBOS?.brokenPrice).toBe(125);
  });
});

describe('FalconEngine', () => {
  it('detects liquidity sweep reversal with min 1:2.5 RR', () => {
    const candles: Candle[] = [
      { timestamp: 1000, open: 100, high: 102, low: 98, close: 101, volume: 5 },
      { timestamp: 2000, open: 101, high: 106, low: 100, close: 105, volume: 5 },
      { timestamp: 3000, open: 105, high: 120, low: 104, close: 118, volume: 5 }, // Swing High at 120
      { timestamp: 4000, open: 118, high: 115, low: 110, close: 112, volume: 5 },
      { timestamp: 5000, open: 112, high: 110, low: 105, close: 108, volume: 5 },
      // Sweep candle: wicks above 120 to 122, but closes back down at 116
      { timestamp: 6000, open: 108, high: 122, low: 107, close: 116, volume: 5 },
    ];

    const signal = FalconEngine.evaluate('Volatility 75 Index', 'R_75', candles, 5.0, 116);
    expect(signal).not.toBeNull();
    expect(signal?.setupName).toBe('FALCON_LIQUIDITY_SWEEP');
    expect(signal?.side).toBe('SELL');
    expect(signal?.stopLoss).toBeGreaterThan(116);
    expect(signal?.takeProfit).toBeLessThan(116);
    expect(signal?.rrRatio).toBeGreaterThanOrEqual(2.5);
    expect(signal?.riskUsd).toBe(0.10);
  });
});

describe('ExecutionEngine', () => {
  it('suppresses entries when controller is not running', () => {
    const store = new ControllerStore(); // starts in 'stopped'
    const engine = new ExecutionEngine(store);

    engine.handleTick('R_75', 100, 1700000000);
    expect(store.snapshot.positions).toHaveLength(0);
  });

  it('evaluates position lifecycle, updates unrealized P&L, and triggers TP hit', () => {
    const initial = createInitialState();
    initial.status = 'running';
    const store = new ControllerStore(initial);
    const engine = new ExecutionEngine(store);

    // Seed candles with a bullish BOS setup
    const candles: Candle[] = [
      { timestamp: 1000, open: 100, high: 105, low: 95, close: 102, volume: 5 },
      { timestamp: 2000, open: 102, high: 110, low: 100, close: 108, volume: 5 },
      { timestamp: 3000, open: 108, high: 125, low: 107, close: 120, volume: 5 },
      { timestamp: 4000, open: 120, high: 118, low: 112, close: 115, volume: 5 },
      { timestamp: 5000, open: 115, high: 114, low: 108, close: 110, volume: 5 },
      { timestamp: 6000, open: 110, high: 130, low: 109, close: 128, volume: 5 },
    ];
    engine.getAggregator().seedCandles('R_75', candles);

    // Feed tick above breakout to trigger entry
    engine.handleTick('R_75', 130, 1700000000);
    expect(store.snapshot.positions).toHaveLength(1);
    const pos = store.snapshot.positions[0]!;
    expect(pos.symbol).toBe('Volatility 75 Index');
    expect(pos.side).toBe('BUY');
    expect(pos.risk).toBe(0.10);

    // Price moves toward TP: unrealized P&L should be positive
    engine.handleTick('R_75', 135, 1700000010);
    expect(store.snapshot.positions[0]!.unrealizedPnl).toBeGreaterThan(0);

    // Price hits Take Profit
    engine.handleTick('R_75', pos.takeProfit! + 5, 1700000020);
    // Position should be closed
    expect(store.snapshot.positions).toHaveLength(0);
    // Realized gain added to balance
    expect(store.snapshot.balance).toBeGreaterThan(initial.balance);
    expect(store.snapshot.sessionPnl).toBeGreaterThan(0);
  });

  it('closes position and records loss when Stop Loss is hit', () => {
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

    engine.handleTick('R_75', 130, 1700000000);
    expect(store.snapshot.positions).toHaveLength(1);
    const pos = store.snapshot.positions[0]!;

    // Price crashes below Stop Loss
    engine.handleTick('R_75', pos.stopLoss! - 5, 1700000015);
    expect(store.snapshot.positions).toHaveLength(0);
    expect(store.snapshot.balance).toBeLessThan(initial.balance);
    expect(store.snapshot.sessionPnl).toBeLessThan(0);
  });

  it('forwards signal execution to Mt5Bridge when bridge is connected', () => {
    const initial = createInitialState();
    initial.status = 'running';
    const store = new ControllerStore(initial);
    const bridge = new Mt5Bridge(store);
    bridge.handleTelemetry({
      account: 6048573,
      balance: 10000,
      equity: 10000,
      freeMargin: 10000,
      margin: 0,
      dailyPnlUsd: 0,
      openPositions: [],
      riskLocked: false,
      equityFloorLocked: false,
      terminalTime: new Date().toISOString(),
    });
    expect(bridge.isConnected()).toBe(true);

    const engine = new ExecutionEngine(store, bridge);

    const candles: Candle[] = [
      { timestamp: 1000, open: 100, high: 105, low: 95, close: 102, volume: 5 },
      { timestamp: 2000, open: 102, high: 110, low: 100, close: 108, volume: 5 },
      { timestamp: 3000, open: 108, high: 125, low: 107, close: 120, volume: 5 },
      { timestamp: 4000, open: 120, high: 118, low: 112, close: 115, volume: 5 },
      { timestamp: 5000, open: 115, high: 114, low: 108, close: 110, volume: 5 },
      { timestamp: 6000, open: 110, high: 130, low: 109, close: 128, volume: 5 },
    ];
    engine.getAggregator().seedCandles('R_75', candles);

    engine.handleTick('R_75', 130, 1700000000);

    const commands = bridge.pollCommands();
    expect(commands).toHaveLength(1);
    expect(commands[0]!.type).toBe('EXECUTE_ORDER');
    expect(commands[0]!.symbol).toBe('Volatility 75 Index');
    expect(commands[0]!.direction).toBe('BUY');
    expect(commands[0]!.lots).toBe(0);
  });
});
