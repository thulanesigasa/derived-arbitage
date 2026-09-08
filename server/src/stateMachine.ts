import { randomUUID } from 'node:crypto';
import { ALL_SYMBOLS, type ActivityItem, type AutomationStatus, type ControllerState, type ControlAction, type SymbolName } from '../../src/types.js';
import { calculateLocks } from './risk.js';

export class TransitionError extends Error {
  constructor(message: string, public readonly code = 'INVALID_TRANSITION') {
    super(message);
  }
}

const allowed: Record<ControlAction, AutomationStatus[]> = {
  start: ['stopped'],
  pause: ['running'],
  resume: ['paused'],
  stop: ['starting', 'running', 'pausing', 'paused'],
  emergencyExit: ['starting', 'running', 'pausing', 'paused', 'stopping', 'emergency'],
};

export function createInitialState(now = new Date()): ControllerState {
  return {
    serverInstanceId: randomUUID(),
    revision: 1,
    status: 'stopped',
    accountType: 'Standard',
    mode: 'DEMO',
    connected: true,
    lastHeartbeat: now.toISOString(),
    balance: 20,
    equity: 20,
    sessionPnl: 0,
    dailyPnl: 0,
    weeklyPnl: 0,
    drawdown: 0,
    marginUsagePercent: 0,
    selectedSymbols: [...ALL_SYMBOLS],
    positions: [],
    riskPolicy: {
      initialBalance: 20,
      absoluteEquityFloor: 15,
      maximumTotalLoss: 5,
      defaultRiskPerTrade: 0.1,
      hardMaxRiskPerTrade: 0.2,
      dailyLossLock: 0.4,
      weeklyLossLock: 1,
      maxOpenPositions: 1,
      maxMarginUsagePercent: 20,
    },
    dailyLocked: false,
    weeklyLocked: false,
    equityFloorLocked: false,
    activity: [activity('info', 'Mock server restarted safely in Stopped. No live broker connection exists.', now)],
  };
}

function activity(kind: ActivityItem['kind'], message: string, now = new Date()): ActivityItem {
  return { id: randomUUID(), at: now.toISOString(), kind, message };
}

function log(state: ControllerState, kind: ActivityItem['kind'], message: string): void {
  state.activity = [activity(kind, message), ...state.activity].slice(0, 30);
}

export class ControllerStore {
  private state: ControllerState;
  private requestCache = new Map<string, ControllerState>();
  private completionTimer?: NodeJS.Timeout;
  private listeners = new Set<(state: ControllerState) => void>();

  constructor(initial = createInitialState()) {
    this.state = structuredClone(initial);
  }

  get snapshot(): ControllerState {
    return structuredClone(this.state);
  }

  subscribe(listener: (state: ControllerState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private publish(): void {
    const snapshot = this.snapshot;
    this.listeners.forEach((listener) => listener(snapshot));
  }

  private mutate(fn: (state: ControllerState) => void): void {
    fn(this.state);
    Object.assign(this.state, calculateLocks(this.state));
    this.state.revision += 1;
    this.publish();
  }

  heartbeat(now = new Date()): ControllerState {
    this.mutate((state) => {
      state.lastHeartbeat = now.toISOString();
      state.connected = true;
    });
    return this.snapshot;
  }

  setSymbols(symbols: SymbolName[], expectedRevision: number, requestId: string): ControllerState {
    const cached = this.requestCache.get(requestId);
    if (cached) return structuredClone(cached);
    this.assertRevision(expectedRevision);
    const unique = [...new Set(symbols)];
    if (!unique.length) throw new TransitionError('Select at least one simulated instrument.', 'INVALID_SETTINGS');
    if (unique.some((symbol) => !ALL_SYMBOLS.includes(symbol))) throw new TransitionError('Unknown instrument.', 'INVALID_SETTINGS');
    this.mutate((state) => {
      state.selectedSymbols = unique;
      log(state, 'info', `Simulation watchlist updated: ${unique.length} instrument${unique.length === 1 ? '' : 's'}.`);
    });
    return this.cache(requestId);
  }

  control(action: ControlAction, expectedRevision: number, requestId: string): ControllerState {
    const cached = this.requestCache.get(requestId);
    if (cached) return structuredClone(cached);
    this.assertRevision(expectedRevision);
    if (!allowed[action].includes(this.state.status)) {
      throw new TransitionError(`${action} is not allowed while ${this.state.status}.`);
    }

    if (action === 'start' || action === 'resume') this.assertCanRun();
    if (this.completionTimer) clearTimeout(this.completionTimer);

    const transitions: Record<ControlAction, { interim: AutomationStatus; final: AutomationStatus; delay: number; message: string }> = {
      start: { interim: 'starting', final: 'running', delay: 500, message: 'Start acknowledged by mock server.' },
      pause: { interim: 'pausing', final: 'paused', delay: 400, message: 'Pause acknowledged. New entries blocked; open simulation management remains active.' },
      resume: { interim: 'starting', final: 'running', delay: 400, message: 'Resume acknowledged by mock server.' },
      stop: { interim: 'stopping', final: 'stopped', delay: 500, message: 'Stop acknowledged. Monitoring remains available; open simulations are not abandoned.' },
      emergencyExit: { interim: 'emergency', final: 'stopped', delay: 300, message: 'Emergency Exit acknowledged. All simulated positions cleared.' },
    };
    const transition = transitions[action];
    this.mutate((state) => {
      state.status = transition.interim;
      if (action === 'emergencyExit') {
        state.positions = [];
        state.marginUsagePercent = 0;
      }
      log(state, action === 'emergencyExit' ? 'danger' : 'info', transition.message);
    });
    const response = this.cache(requestId);
    this.completionTimer = setTimeout(() => {
      this.mutate((state) => {
        state.status = transition.final;
        log(state, transition.final === 'running' ? 'success' : 'info', `Mock automation is now ${transition.final}.`);
      });
    }, transition.delay);
    this.completionTimer.unref?.();
    return response;
  }

  replaceForTest(next: ControllerState): void {
    this.state = structuredClone(next);
  }

  private assertCanRun(): void {
    if (this.state.equity <= this.state.riskPolicy.absoluteEquityFloor) throw new TransitionError('Cannot run: the $15 equity floor is active.', 'RISK_LOCK');
    if (this.state.dailyPnl <= -this.state.riskPolicy.dailyLossLock) throw new TransitionError('Cannot run: daily loss lock is active.', 'RISK_LOCK');
    if (this.state.weeklyPnl <= -this.state.riskPolicy.weeklyLossLock) throw new TransitionError('Cannot run: weekly loss lock is active.', 'RISK_LOCK');
    if (this.state.drawdown >= this.state.riskPolicy.maximumTotalLoss) throw new TransitionError('Cannot run: maximum total loss is active.', 'RISK_LOCK');
  }

  private assertRevision(expectedRevision: number): void {
    if (expectedRevision !== this.state.revision) throw new TransitionError('State changed. Refresh and try again.', 'REVISION_CONFLICT');
  }

  private cache(requestId: string): ControllerState {
    const snapshot = this.snapshot;
    this.requestCache.set(requestId, snapshot);
    if (this.requestCache.size > 200) this.requestCache.delete(this.requestCache.keys().next().value as string);
    return snapshot;
  }
}
