export const ALL_SYMBOLS = [
  'Volatility 75 Index',
  'Volatility 100 Index',
  'Volatility 100 (1s) Index',
  'Step Index',
  'Boom 500 Index',
  'Boom 1000 Index',
  'Crash 500 Index',
  'Crash 100 Index',
  'Volatility 50 Index',
  'Volatility 10 Index',
] as const;

export type SymbolName = (typeof ALL_SYMBOLS)[number];

export type AutomationStatus =
  | 'stopped'
  | 'starting'
  | 'running'
  | 'pausing'
  | 'paused'
  | 'stopping'
  | 'emergency';

export type ControlAction = 'start' | 'pause' | 'resume' | 'stop' | 'emergencyExit';

export interface RiskPolicy {
  initialBalance: number;
  absoluteEquityFloor: number;
  maximumTotalLoss: number;
  defaultRiskPerTrade: number;
  hardMaxRiskPerTrade: number;
  dailyLossLock: number;
  weeklyLossLock: number;
  maxOpenPositions: number;
  maxMarginUsagePercent: number;
}

export interface SimulatedPosition {
  id: string;
  symbol: SymbolName;
  side: 'BUY' | 'SELL';
  risk: number;
  marginUsed: number;
  unrealizedPnl: number;
  openedAt: string;
  simulated: true;
}

export interface ActivityItem {
  id: string;
  at: string;
  kind: 'info' | 'success' | 'warning' | 'danger';
  message: string;
}

export interface ControllerState {
  serverInstanceId: string;
  revision: number;
  status: AutomationStatus;
  accountType: 'Standard';
  mode: 'DEMO';
  connected: boolean;
  lastHeartbeat: string;
  balance: number;
  equity: number;
  sessionPnl: number;
  dailyPnl: number;
  weeklyPnl: number;
  drawdown: number;
  marginUsagePercent: number;
  selectedSymbols: SymbolName[];
  positions: SimulatedPosition[];
  riskPolicy: RiskPolicy;
  dailyLocked: boolean;
  weeklyLocked: boolean;
  equityFloorLocked: boolean;
  activity: ActivityItem[];
}

export interface ApiErrorShape {
  error: string;
  code?: string;
  state?: ControllerState;
}

// ─── Market Profiler (Phase 2) ──────────────────────────────────────────────

export interface SymbolRiskConfig {
  riskPerTradeUsd:    number;
  equityFloorUsd:     number;
  startingBalanceUsd: number;
}

export interface SymbolProfile {
  code:                string;
  display:             SymbolName;
  group:               'volatility' | 'boom' | 'crash' | 'step';
  available:           boolean;
  isOpen:              boolean;
  pip:                 number;
  spotPrice:           number;
  spreadMedian:        number | null;
  spreadP95:           number | null;
  /** Ticks per second over the last 30 s of data. */
  tickVelocity:        number;
  tickCount:           number;
  affordable:          boolean;
  affordabilityNote:   string;
  lastTickAt:          string | null;
  riskConfig:          SymbolRiskConfig;
}

export interface ProfilerApiState {
  connected:        boolean;
  authorized:       boolean;
  profiles:         SymbolProfile[];
  lastRefreshedAt:  string | null;
}
