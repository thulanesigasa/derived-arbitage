import { describe, expect, it } from 'vitest';
import { ActivationGateEngine, type EvaluatedTrade } from '../src/gates/activationGate.js';
import { ControllerStore, TransitionError } from '../src/stateMachine.js';

describe('Phase 6: Live Activation Gate Engine', () => {
  it('passes all 5 non-negotiable gates on verified baseline demo track record', () => {
    const engine = new ActivationGateEngine();
    const report = engine.evaluateGates();

    expect(report.eligibleForLive).toBe(true);
    expect(report.gates).toHaveLength(5);
    expect(report.gates.every((g) => g.passed)).toBe(true);
    expect(report.monteCarlo.passed).toBe(true);
    expect(report.monteCarlo.simulatedMaxDrawdown).toBeLessThan(3.00);
  });

  it('rejects activation if Profit Factor is below 1.20', () => {
    // Generate losing trade history: 50 wins of $0.10, 50 losses of $0.10 (PF = 1.0)
    const failingTrades: EvaluatedTrade[] = [];
    const baseTime = Date.now() - 60 * 86400 * 1000;

    for (let i = 0; i < 90; i++) {
      failingTrades.push({
        ticket: 200000 + i,
        symbol: 'Volatility 75 Index',
        profitUsd: (i % 2 === 0) ? 0.10 : -0.11, // PF ~ 0.91
        riskUsd: 0.10,
        lots: 0.20,
        openTime: new Date(baseTime + i * 3600 * 1000).toISOString(),
        closeTime: new Date(baseTime + i * 3600 * 1000 + 1800 * 1000).toISOString(),
        commission: 0,
        swap: 0,
      });
    }

    const engine = new ActivationGateEngine(failingTrades);
    const report = engine.evaluateGates();

    expect(report.eligibleForLive).toBe(false);
    const pfGate = report.gates.find((g) => g.id === 'gate-profit-factor');
    expect(pfGate?.passed).toBe(false);
  });

  it('rejects activation if strategy is dependent on top 5 outlier trades', () => {
    // 95 break-even or losing trades, plus 5 huge lucky wins
    const outlierTrades: EvaluatedTrade[] = [];
    const baseTime = Date.now() - 60 * 86400 * 1000;

    // 5 lucky windfall trades
    for (let i = 0; i < 5; i++) {
      outlierTrades.push({
        ticket: 300000 + i,
        symbol: 'Boom 1000 Index',
        profitUsd: 2.00, // $10 total from top 5
        riskUsd: 0.10,
        lots: 0.20,
        openTime: new Date(baseTime + i * 86400 * 1000).toISOString(),
        closeTime: new Date(baseTime + i * 86400 * 1000 + 1800 * 1000).toISOString(),
        commission: 0,
        swap: 0,
      });
    }

    // 85 small losses summing to -$8.50
    for (let i = 5; i < 90; i++) {
      outlierTrades.push({
        ticket: 300000 + i,
        symbol: 'Volatility 75 Index',
        profitUsd: -0.10,
        riskUsd: 0.10,
        lots: 0.20,
        openTime: new Date(baseTime + i * 86400 * 1000).toISOString(),
        closeTime: new Date(baseTime + i * 86400 * 1000 + 1800 * 1000).toISOString(),
        commission: 0,
        swap: 0,
      });
    }

    // Total net = +$10.00 - $8.50 = +$1.50 (profitable overall, but without top 5: -$8.50!)
    const engine = new ActivationGateEngine(outlierTrades);
    const report = engine.evaluateGates();

    expect(report.eligibleForLive).toBe(false);
    const outlierGate = report.gates.find((g) => g.id === 'gate-outlier-independence');
    expect(outlierGate?.passed).toBe(false);
  });

  it('rejects activation if martingale or size escalation after losses is detected', () => {
    const martingaleTrades: EvaluatedTrade[] = [];
    const baseTime = Date.now() - 60 * 86400 * 1000;

    for (let i = 0; i < 90; i++) {
      const isLoss = i % 2 === 0;
      // Volume doubles after loss
      const lots = isLoss ? 0.20 : 0.50;
      const risk = isLoss ? 0.10 : 0.25; // Exceeds $0.20 hard max!

      martingaleTrades.push({
        ticket: 400000 + i,
        symbol: 'Crash 500 Index',
        profitUsd: isLoss ? -0.10 : 0.35,
        riskUsd: risk,
        lots: lots,
        openTime: new Date(baseTime + i * 86400 * 1000).toISOString(),
        closeTime: new Date(baseTime + i * 86400 * 1000 + 1800 * 1000).toISOString(),
        commission: 0,
        swap: 0,
      });
    }

    const engine = new ActivationGateEngine(martingaleTrades);
    const report = engine.evaluateGates();

    expect(report.eligibleForLive).toBe(false);
    const sizingGate = report.gates.find((g) => g.id === 'gate-sizing-discipline');
    expect(sizingGate?.passed).toBe(false);
  });

  it('rejects activation if demo soak period is less than 8 weeks (56 days)', () => {
    const shortTrades: EvaluatedTrade[] = [];
    const baseTime = Date.now() - 10 * 86400 * 1000; // Only 10 days!

    for (let i = 0; i < 90; i++) {
      shortTrades.push({
        ticket: 500000 + i,
        symbol: 'Volatility 100 Index',
        profitUsd: (i % 2 === 0) ? 0.25 : -0.10,
        riskUsd: 0.10,
        lots: 0.20,
        openTime: new Date(baseTime + i * 3600 * 1000).toISOString(),
        closeTime: new Date(baseTime + i * 3600 * 1000 + 1800 * 1000).toISOString(),
        commission: 0,
        swap: 0,
      });
    }

    const engine = new ActivationGateEngine(shortTrades);
    const report = engine.evaluateGates();

    expect(report.eligibleForLive).toBe(false);
    const soakGate = report.gates.find((g) => g.id === 'gate-soak-period');
    expect(soakGate?.passed).toBe(false);
  });

  it('state machine transitions to LIVE when gates pass', () => {
    const store = new ControllerStore();
    expect(store.snapshot.mode).toBe('DEMO');

    const updated = store.activateLiveMode(1, 'req-live-ok', true);
    expect(updated.mode).toBe('LIVE');
    expect(store.snapshot.activity.some((a) => a.kind === 'success' && a.message.includes('LIVE mode activated'))).toBe(true);
  });

  it('state machine rejects LIVE mode transition when gates fail', () => {
    const store = new ControllerStore();
    expect(() => store.activateLiveMode(1, 'req-live-fail', false)).toThrow(TransitionError);
    expect(store.snapshot.mode).toBe('DEMO');
  });
});
