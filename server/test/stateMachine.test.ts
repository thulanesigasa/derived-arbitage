import { describe, expect, it, vi } from 'vitest';
import { assessNewTrade } from '../src/risk.js';
import { ControllerStore, TransitionError, createInitialState } from '../src/stateMachine.js';

describe('ControllerStore state machine', () => {
  it('accepts allowed transitions and reaches their stable states', async () => {
    vi.useFakeTimers();
    const store = new ControllerStore();
    expect(store.control('start', 1, 'request-start-1').status).toBe('starting');
    await vi.advanceTimersByTimeAsync(500);
    expect(store.snapshot.status).toBe('running');
    const revision = store.snapshot.revision;
    expect(store.control('pause', revision, 'request-pause-1').status).toBe('pausing');
    await vi.advanceTimersByTimeAsync(400);
    expect(store.snapshot.status).toBe('paused');
    vi.useRealTimers();
  });

  it('rejects invalid transitions', () => {
    const store = new ControllerStore();
    expect(() => store.control('pause', 1, 'request-pause-invalid')).toThrow(TransitionError);
  });

  it('returns the same acknowledgement for a repeated request id', () => {
    const store = new ControllerStore();
    const first = store.control('start', 1, 'request-idempotent');
    const replay = store.control('start', 999, 'request-idempotent');
    expect(replay).toEqual(first);
  });

  it('rejects stale revisions', () => {
    const store = new ControllerStore();
    store.heartbeat();
    expect(() => store.control('start', 1, 'request-stale-revision')).toThrow(/State changed/);
  });

  it('emergency exit clears simulated positions predictably', () => {
    const state = createInitialState();
    state.status = 'running';
    state.positions = [{ id: 'sim-1', symbol: 'Volatility 75 Index', side: 'BUY', risk: 0.1, marginUsed: 1, unrealizedPnl: -0.02, openedAt: new Date().toISOString(), simulated: true }];
    state.marginUsagePercent = 5;
    const store = new ControllerStore(state);
    const response = store.control('emergencyExit', state.revision, 'request-emergency');
    expect(response.status).toBe('emergency');
    expect(response.positions).toHaveLength(0);
    expect(response.marginUsagePercent).toBe(0);
  });

  it('blocks startup at the absolute equity floor', () => {
    const state = createInitialState();
    state.equity = 15;
    const store = new ControllerStore(state);
    expect(() => store.control('start', state.revision, 'request-floor-lock')).toThrow(/equity floor/);
  });
});

describe('risk guard', () => {
  it('allows the conservative default when all guards are clear', () => {
    const state = createInitialState();
    state.status = 'running';
    expect(assessNewTrade(state, { risk: 0.1, marginUsagePercent: 10 })).toEqual({ allowed: true, reasons: [] });
  });

  it('blocks hard-risk, margin, position, daily, weekly and equity-floor violations', () => {
    const state = createInitialState();
    state.status = 'running';
    state.equity = 15.1;
    state.dailyPnl = -0.4;
    state.weeklyPnl = -1;
    state.positions.push({ id: 'sim-1', symbol: 'Step Index', side: 'SELL', risk: 0.1, marginUsed: 1, unrealizedPnl: 0, openedAt: new Date().toISOString(), simulated: true });
    const result = assessNewTrade(state, { risk: 0.21, marginUsagePercent: 21 });
    expect(result.allowed).toBe(false);
    expect(result.reasons.length).toBeGreaterThanOrEqual(6);
  });
});
